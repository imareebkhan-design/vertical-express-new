import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/prisma/generated/client/client";

export interface OrderAddressSnapshot {
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
}

const orderInclude = {
  items: true,
  statusEvents: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export async function getOrderByNo(userId: string, orderNo: string): Promise<OrderWithDetails | null> {
  return db.order.findFirst({
    where: { orderNo, userId },
    include: orderInclude,
  });
}

export async function listOrders(userId: string, page = 1, perPage = 10) {
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { items: true, payments: { take: 1, orderBy: { createdAt: "desc" } } },
    }),
    db.order.count({ where: { userId } }),
  ]);
  return { orders, total, page, perPage };
}

/** Helper to safely release/restock inventory for an order, scoped to its warehouse. */
export async function releaseOrderInventory(
  tx: Prisma.TransactionClient,
  orderId: string,
  warehouseId?: string | null
) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    const inv = await tx.inventory.findFirst({
      where: {
        variantId: item.variantId,
        ...(warehouseId ? { warehouseId } : {}),
      },
    });
    if (inv) {
      await tx.inventory.update({
        where: { id: inv.id },
        data: { qtyOnHand: { increment: item.qty } },
      });
    }
  }
}

/** Cancel while still pre-fulfilment; releases stock. */
export async function cancelOrder(userId: string, orderNo: string, reason: string) {
  const order = await db.order.findFirst({
    where: { orderNo, userId },
    include: { items: true },
  });
  if (!order) throw new Error("NOT_FOUND");
  if (!["pending_payment", "confirmed"].includes(order.status)) {
    throw new Error("NOT_CANCELLABLE");
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "cancelled", cancelledReason: reason },
    });
    await tx.orderStatusEvent.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: "cancelled", note: reason, actorUserId: userId },
    });
    // Restock to the specific warehouse where stock was reserved.
    await releaseOrderInventory(tx, order.id, order.warehouseId);
  });
}

/** Copy a past order's items back into the active cart. */
export async function reorder(userId: string, orderNo: string) {
  const order = await db.order.findFirst({ where: { orderNo, userId }, include: { items: true } });
  if (!order) throw new Error("NOT_FOUND");

  const cart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  for (const item of order.items) {
    // Skip variants that no longer exist / are inactive.
    const variant = await db.productVariant.findFirst({ where: { id: item.variantId, isActive: true } });
    if (!variant) continue;
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
      update: { qty: { increment: item.qty } },
      create: { cartId: cart.id, variantId: item.variantId, qty: item.qty },
    });
  }
}

/**
 * Automatically cancels stale `pending_payment` orders older than maxAgeMinutes
 * (default 15 mins) and releases their reserved inventory back to qtyOnHand.
 */
export async function cleanupExpiredPendingOrders(maxAgeMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  const staleOrders = await db.order.findMany({
    where: {
      status: "pending_payment",
      placedAt: { lte: cutoff },
    },
    include: { items: true },
    take: 20,
  });

  let cancelledCount = 0;

  for (const order of staleOrders) {
    try {
      await db.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: { id: order.id, status: "pending_payment" },
          data: { status: "cancelled", cancelledReason: "Payment window expired (15 min)" },
        });

        if (updated.count > 0) {
          await tx.orderStatusEvent.create({
            data: {
              orderId: order.id,
              fromStatus: "pending_payment",
              toStatus: "cancelled",
              note: "Stale pending_payment auto-cancelled after 15 minutes",
            },
          });

          await releaseOrderInventory(tx, order.id, order.warehouseId);
          cancelledCount++;
        }
      });
    } catch {
      // Continue cleanup loop if single order fails
    }
  }

  return cancelledCount;
}
