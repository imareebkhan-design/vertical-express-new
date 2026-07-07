import "server-only";
import { db } from "@/lib/db";

/**
 * Merge a guest cart (keyed by anon_id cookie) into the user's cart at login.
 * Quantities are combined for duplicate variants. Fully implemented here so
 * Milestone 5 (cart) only wires the anon cookie.
 */
export async function mergeGuestCart(userId: string, anonId: string | null) {
  if (!anonId) return;

  const guestCart = await db.cart.findUnique({
    where: { anonId },
    include: { items: true },
  });
  if (!guestCart || guestCart.items.length === 0) {
    if (guestCart) await db.cart.delete({ where: { id: guestCart.id } }).catch(() => {});
    return;
  }

  const userCart = await db.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  for (const item of guestCart.items) {
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
      update: { qty: { increment: item.qty } },
      create: { cartId: userCart.id, variantId: item.variantId, qty: item.qty },
    });
  }

  await db.cart.delete({ where: { id: guestCart.id } });
}
