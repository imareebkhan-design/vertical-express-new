import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

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
    // Restock.
    for (const item of order.items) {
      const inv = await tx.inventory.findFirst({ where: { variantId: item.variantId } });
      if (inv) {
        await tx.inventory.update({ where: { id: inv.id }, data: { qtyOnHand: { increment: item.qty } } });
      }
    }
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
