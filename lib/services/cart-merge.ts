import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { resolveUserFromToken } from "@/lib/auth/current-user";
import { log } from "@/lib/observability";

/**
 * Merge a guest cart (keyed by the `ve_anon_cart` cookie) into the user's cart
 * at sign-in. Quantities are combined for duplicate variants. Stock is not
 * decided here: every cart read limits a line to what is available and flags it
 * (`getCartSummary`), which is the feedback the customer sees.
 *
 * ONE TRANSACTION, AND THE GUEST CART IS THE CLAIM (E8). This used to add the
 * guest lines one by one and delete the guest cart afterwards. A failure part-
 * way left the first lines added *and* the guest cart in place, so a retry added
 * them again; two tabs signing in at once both read the guest cart, both added
 * it, and the loser's delete threw. Now the guest cart row is locked first and
 * everything — reading its lines, adding them, deleting it — happens in one
 * transaction: a failure changes nothing and leaves the guest items to retry,
 * and a second merge waits for the lock, then finds no guest cart and does
 * nothing. Retrying is always safe.
 *
 * Returns how many guest lines were merged (0 when there was nothing, or it had
 * already been merged). Throws when the merge failed; nothing was changed then.
 */
export async function mergeGuestCart(userId: string, anonId: string | null): Promise<{ merged: number }> {
  if (!anonId) return { merged: 0 };

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM carts WHERE anon_id = ${anonId}::uuid AND user_id IS NULL FOR UPDATE`;
    if (locked.length === 0) return { merged: 0 };
    const guestCartId = locked[0].id;

    const items = await tx.cartItem.findMany({ where: { cartId: guestCartId } });
    if (items.length > 0) {
      const userCart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
      for (const item of items) {
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
          update: { qty: { increment: item.qty } },
          create: { cartId: userCart.id, variantId: item.variantId, qty: item.qty },
        });
      }
    }

    await tx.cart.delete({ where: { id: guestCartId } });
    return { merged: items.length };
  });
}

/** The guest cart's cookie — set by the cart actions for a guest, cleared once merged. */
export const GUEST_CART_COOKIE = "ve_anon_cart";

/**
 * The merge as sign-in and the cart actions run it (E8): never fails the
 * caller. Signing in must not be refused because a cart could not be moved,
 * so a failure is logged and reported as `clearCookie: false` — the guest
 * cookie stays, the guest items stay (the merge changed nothing), and the next
 * signed-in cart request tries again. `clearCookie` is true once there is
 * nothing left to merge.
 */
export async function mergeGuestCartSafely(userId: string, anonId: string | null): Promise<{ merged: number; clearCookie: boolean }> {
  if (!anonId) return { merged: 0, clearCookie: false };
  try {
    const { merged } = await mergeGuestCart(userId, anonId);
    return { merged, clearCookie: true };
  } catch (err) {
    log("ERROR", {
      service: "cart-service",
      event: "guest_cart_merge_failed",
      metadata: { error: err instanceof Error ? err.message : "unknown" },
    });
    return { merged: 0, clearCookie: false };
  }
}

/**
 * Sign-in's half of the merge: the verified Firebase identity → this app's user
 * (the one resolver, `resolveUserFromToken`, provisioning a first-time
 * customer) → the guest cart merged into theirs. Used by `POST
 * /api/auth/session`, which had never merged at all: the only call was in the
 * retired Supabase `verifyOtp`, so a guest's items vanished at sign-in.
 */
export async function completeSignInCart(token: DecodedIdToken, anonId: string | null) {
  if (!anonId) return { merged: 0, clearCookie: false };
  const userId = await resolveUserFromToken(token);
  if (!userId) return { merged: 0, clearCookie: false };
  return mergeGuestCartSafely(userId, anonId);
}
