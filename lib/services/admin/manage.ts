import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus, BookingStatus } from "@/prisma/generated/client";
import { creditCashbackForOrder } from "@/lib/services/wallet";
import { notifyOrderStatusChange } from "@/lib/services/notifications";
import { releaseOrderInventory } from "@/lib/services/orders";

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
      include: { items: { select: { id: true } } },
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
    }
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

export async function advanceBookingStatus(bookingId: string, to: BookingStatus) {
  await db.booking.update({ where: { id: bookingId }, data: { status: to } });
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
