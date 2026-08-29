import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus, BookingStatus } from "@prisma/client";
import { creditCashbackForOrder } from "@/lib/services/wallet";
import { notifyOrderStatusChange } from "@/lib/services/notifications";
import { releaseOrderInventory } from "@/lib/services/orders";
import { recordAudit } from "@/lib/services/audit";

// Allowed forward transitions for the order fulfilment state machine.
const ORDER_FLOW: Record<string, OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
  refund_initiated: ["refunded"],
  refunded: [],
};

export function nextOrderStatuses(current: OrderStatus): OrderStatus[] {
  return ORDER_FLOW[current] ?? [];
}

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
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("NOT_FOUND");
  if (!nextOrderStatuses(order.status).includes(to)) throw new Error("INVALID_TRANSITION");

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: to,
        ...(to === "delivered" ? { deliveredAt: new Date() } : {}),
      },
    });
    await tx.orderStatusEvent.create({
      data: { orderId, fromStatus: order.status, toStatus: to, actorUserId, note: "Admin update" },
    });
    // Restock on admin cancellation.
    if (to === "cancelled") {
      await releaseOrderInventory(tx, orderId, order.warehouseId);
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
        brand: { select: { name: true } },
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
    },
  });
}
