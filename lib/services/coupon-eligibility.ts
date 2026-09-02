import "server-only";
import { db } from "@/lib/db";
import type { Coupon } from "@prisma/client";

/**
 * Whether a coupon may be used, and by whom.
 *
 * WHAT WAS WRONG
 *
 * `Coupon` has carried `usageLimit`, `perUserLimit` and `firstNOrders` since
 * the schema was written, and the operations console printed all three. None of
 * them was ever checked. Checkout looked at `isActive`, the date window and
 * `minOrderPaise`, and stopped.
 *
 * So a coupon marked "one per customer, 100 uses" was in fact unlimited and
 * unlimited-per-person. Anybody who learned a code could spend it as often as
 * they liked, and the console said otherwise on screen. That is a live giveaway
 * of margin, not a hypothetical one — the numbers were displayed as if they
 * bound something.
 *
 * Usage is counted from `Order.couponCode`, which the order path already
 * writes. No new table is needed to make the existing fields mean what they
 * say.
 *
 * A NOTE ON THE RACE THAT REMAINS
 *
 * Two orders placed in the same instant can both pass a `usageLimit` check and
 * both be allowed, taking a 100-use coupon to 101. Closing that needs a
 * redemption row with a unique constraint, counted inside the order
 * transaction — the same shape as the order-idempotency guarantee. That is a
 * schema change and it is written down rather than pretended away. The window
 * is small and the overshoot is bounded by concurrency; unlimited use was not.
 */
export type CouponRefusal =
  | "not_found"
  | "below_minimum"
  | "usage_limit_reached"
  | "per_user_limit_reached"
  | "not_within_first_orders";

export type CouponDecision =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: CouponRefusal };

/** Orders that consumed a coupon. A cancelled order never completed, so it
 *  gives its use back; a delivered or refunded one spent it. */
const CONSUMED = { status: { not: "cancelled" } } as const;

export async function resolveCoupon(params: {
  code: string;
  subtotalPaise: number;
  /** Null for a signed-out preview — per-customer rules cannot be checked
   *  without knowing who is asking, so they are deferred to placement. */
  userId: string | null;
  now?: Date;
}): Promise<CouponDecision> {
  const { code, subtotalPaise, userId } = params;
  const now = params.now ?? new Date();

  const coupon = await db.coupon.findFirst({
    where: {
      code: { equals: code.trim().toUpperCase() },
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
  });

  if (!coupon) return { ok: false, reason: "not_found" };
  if (subtotalPaise < coupon.minOrderPaise) return { ok: false, reason: "below_minimum" };

  if (coupon.usageLimit !== null) {
    const used = await db.order.count({ where: { couponCode: coupon.code, ...CONSUMED } });
    if (used >= coupon.usageLimit) return { ok: false, reason: "usage_limit_reached" };
  }

  /* Everything below is per-customer and needs an identity. A signed-out
     preview sees the coupon as valid; placement, which always has a user,
     is where it is actually decided. */
  if (!userId) return { ok: true, coupon };

  if (coupon.perUserLimit > 0) {
    const mine = await db.order.count({
      where: { couponCode: coupon.code, userId, ...CONSUMED },
    });
    if (mine >= coupon.perUserLimit) return { ok: false, reason: "per_user_limit_reached" };
  }

  if (coupon.firstNOrders !== null) {
    /* "Valid on your first N orders" — so the order about to be placed must be
       the Nth or earlier, which means strictly fewer than N came before it. */
    const previous = await db.order.count({ where: { userId, ...CONSUMED } });
    if (previous >= coupon.firstNOrders) {
      return { ok: false, reason: "not_within_first_orders" };
    }
  }

  return { ok: true, coupon };
}

/** What to tell the customer. Deliberately specific — "invalid coupon" when
 *  somebody has simply already used it is the kind of message that generates a
 *  support call. */
export function refusalMessage(reason: CouponRefusal): string {
  switch (reason) {
    case "below_minimum":
      return "Your order is below this coupon's minimum";
    case "usage_limit_reached":
      return "This coupon has been fully claimed";
    case "per_user_limit_reached":
      return "You have already used this coupon";
    case "not_within_first_orders":
      return "This coupon is for new customers only";
    default:
      return "That coupon code is not valid";
  }
}
