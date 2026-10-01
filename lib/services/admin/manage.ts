import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus, BookingStatus } from "@/prisma/generated/client/client";
import { creditCashbackForOrder } from "@/lib/services/wallet";
import { notifyOrderStatusChange } from "@/lib/services/notifications";
import { releaseOrderInventory } from "@/lib/services/orders";
import { releaseCouponRedemption } from "@/lib/services/coupon-eligibility";
import { recordAudit } from "@/lib/services/audit";
import { canTransitionOrder } from "@/lib/order-flow";
import { triggerAlert } from "@/lib/observability";

/* The map moved to lib/order-flow.ts so the three other paths that write an
   order status can share it instead of each restating the rule. Re-exported
   here because callers and the admin screens already import it from this
   module. */
export { nextOrderStatuses } from "@/lib/order-flow";

export async function adminListOrders(page = 1, perPage = 20, status?: OrderStatus) {
  const where = status ? { status } : {};
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        items: { select: { id: true } },
        /* The artboard's Shipments column: an order that splits is two
           vehicles on two schedules, and a row that hides that reads as one
           job. Status and class only — no promised time exists. */
        shipments: { select: { status: true, speedClass: true }, orderBy: { sequence: "asc" } },
        payments: { select: { status: true, gateway: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.order.count({ where }),
  ]);
  return { orders, total, page, perPage };
}

export async function advanceOrderStatus(
  actorUserId: string,
  orderId: string,
  to: OrderStatus
) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { select: { status: true } } },
  });
  if (!order) throw new Error("NOT_FOUND");
  if (!canTransitionOrder(order.status, to)) throw new Error("INVALID_TRANSITION");

  /* Money recorded or held against the order — any attempt, whatever the
     method label says (the same test as a customer cancel, orders.ts). */
  const funded = order.payments.some((p) => p.status === "captured" || p.status === "authorized");
  /* An online order is confirmed by its payment, never by hand: confirming an
     unpaid one would dispatch goods nobody paid for (architecture principle 7,
     payment-provider-authoritative). Cash on delivery has no payment yet. */
  if (order.status === "pending_payment" && to === "confirmed" && order.paymentMethod !== "cod" && !funded) {
    throw new Error("PAYMENT_REQUIRED");
  }
  /* Cancelling a paid order is allowed — operations may have to — but nothing
     refunds it (ISS-025), so it must not happen quietly. */
  const refundRequired = to === "cancelled" && funded;

  await db.$transaction(async (tx) => {
    /* Compare-and-set on the status read above. A webhook confirming payment,
       the expiry cron, a customer cancel or a second admin click can all move
       the order in between; the loser changes nothing — in particular it does
       not release stock a second time. */
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: to,
        ...(to === "delivered" ? { deliveredAt: new Date() } : {}),
      },
    });
    if (moved.count !== 1) throw new Error("STATUS_CHANGED");
    await tx.orderStatusEvent.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: to,
        actorUserId,
        note: refundRequired ? "Admin update — cancelled with a captured payment: refund required" : "Admin update",
      },
    });
    // Restock on admin cancellation.
    if (to === "cancelled") {
      await releaseOrderInventory(tx, orderId, order.warehouseId);
      await releaseCouponRedemption(tx, orderId);
      // Stock moved. Recorded separately from the status change because it is a
      // different kind of loss to investigate.
      await recordAudit(tx, {
        actorType: "admin",
        actorId: actorUserId,
        action: "inventory.released",
        entityType: "order",
        entityId: orderId,
        before: { reason: "admin_cancellation", warehouseId: order.warehouseId },
      });
    }
    // Same transaction as the update above: an order cannot change state
    // without leaving a trace.
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actorUserId,
      action: "order.status_changed",
      entityType: "order",
      entityId: orderId,
      before: { status: order.status },
      after: { status: to },
    });
  });

  if (refundRequired) {
    /* The same alert a late capture raises; the order is now on
       listCapturedPaymentsOnDeadOrders, the manual refund worklist. */
    triggerAlert("paid_order_cancelled", "An admin cancelled an order with a captured payment — refund required", {
      orderNo: order.orderNo,
      totalPaise: order.totalPaise,
    });
  }

  if (to === "delivered") {
    await creditCashbackForOrder({
      userId: order.userId,
      orderId: order.id,
      orderNo: order.orderNo,
      orderTotalPaise: order.totalPaise,
    });
  }

  await notifyOrderStatusChange({
    userId: order.userId,
    orderNo: order.orderNo,
    status: to,
  });
}

export async function adminListBookings(status?: BookingStatus) {
  return db.booking.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { service: { select: { name: true } } },
  });
}

const BOOKING_FLOW: BookingStatus[] = [
  "received", "scheduled", "visited", "quoted", "in_progress", "completed",
];

export function nextBookingStatuses(current: BookingStatus): BookingStatus[] {
  if (current === "cancelled" || current === "completed") return [];
  const idx = BOOKING_FLOW.indexOf(current);
  const forward = idx >= 0 && idx < BOOKING_FLOW.length - 1 ? [BOOKING_FLOW[idx + 1]] : [];
  return [...forward, "cancelled"];
}

export async function advanceBookingStatus(
  actorUserId: string,
  bookingId: string,
  to: BookingStatus
) {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("NOT_FOUND");
  // `nextBookingStatuses` existed but was never called: any booking could be
  // moved to any status, including backwards or straight to completed. (ISS-014)
  if (!nextBookingStatuses(booking.status).includes(to)) throw new Error("INVALID_TRANSITION");

  await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: to } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actorUserId,
      action: "booking.status_changed",
      entityType: "booking",
      entityId: bookingId,
      before: { status: booking.status },
      after: { status: to },
    });
  });
}

export async function adminListProducts(page = 1, perPage = 30) {
  const [products, total] = await Promise.all([
    db.product.findMany({
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { name: true } },
        variants: { where: { isDefault: true }, take: 1, include: { inventory: true } },
      },
    }),
    db.product.count(),
  ]);
  return { products, total, page, perPage };
}

/**
 * Full detail for one order, for the operations console.
 *
 * Everything here is a snapshot taken at order time — the address JSON, the line
 * prices, the GST breakup — so this reads what the customer actually agreed to
 * rather than what the catalogue says today.
 */
export async function adminGetOrder(orderNo: string) {
  return db.order.findUnique({
    where: { orderNo },
    include: {
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      statusEvents: { orderBy: { createdAt: "asc" } },
      warehouse: { select: { name: true, city: true } },
      user: { select: { id: true, phone: true, email: true } },
      /* The physical half of the order. Without it the console shows what was
         bought and nothing about how it reaches anybody, which is most of what
         a dispatcher opens this page for. */
      shipments: {
        orderBy: { sequence: "asc" },
        include: {
          warehouse: { select: { name: true } },
          /* Who is carrying it. Null until the dispatch board assigns somebody. */
          driver: { select: { name: true, phone: true } },
          vehicle: { select: { registration: true } },
          items: { select: { qty: true, orderItem: { select: { title: true } } } },
        },
      },
    },
  });
}
