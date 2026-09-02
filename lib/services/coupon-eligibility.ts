import "server-only";
import { db } from "@/lib/db";
import type { Coupon } from "@/prisma/generated/client/client";
import type { DbClient } from "@/lib/services/audit";

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

/**
 * Actually spending a coupon, inside the order's transaction.
 *
 * `resolveCoupon` above decides whether a coupon *may* be used. That check and
 * the order that follows it are two separate statements, so two orders placed
 * in the same instant can both pass it — the residual race ISS-066 left open.
 * Reading the count more carefully cannot fix that; the count has to be taken
 * and the decision made in one atomic step.
 *
 * Two limits, two mechanisms, because they are different shapes:
 *
 *   usageLimit is a count across all customers, which cannot be expressed as
 *   uniqueness. It is guarded by a conditional increment of
 *   `Coupon.redeemedCount` — `updateMany` with a `lt` condition, the same shape
 *   as the stock decrement that already guards inventory here. If the row no
 *   longer satisfies the condition the update matches nothing and we know we
 *   lost the race.
 *
 *   perUserLimit is per customer, so it IS uniqueness: the Nth use by a given
 *   customer can exist only once. Two concurrent orders both computing
 *   useIndex 2 collide on `(couponId, userId, useIndex)` and one is refused by
 *   the database rather than by a check that can be outrun.
 *
 * Must be called with the order's `tx`. Called outside one, a failure would
 * leave the counter incremented for an order that never existed — a coupon
 * quietly losing uses to abandoned checkouts.
 */
export type RedeemFailure = "exhausted" | "per_user_limit_reached";

export async function redeemCoupon(
  tx: DbClient,
  params: { couponId: string; userId: string; orderId: string; discountPaise: number }
): Promise<{ ok: true } | { ok: false; reason: RedeemFailure }> {
  const { couponId, userId, orderId, discountPaise } = params;

  const coupon = await tx.coupon.findUnique({
    where: { id: couponId },
    select: { usageLimit: true, perUserLimit: true },
  });
  if (!coupon) return { ok: false, reason: "exhausted" };

  if (coupon.usageLimit !== null) {
    const claimed = await tx.coupon.updateMany({
      where: { id: couponId, redeemedCount: { lt: coupon.usageLimit } },
      data: { redeemedCount: { increment: 1 } },
    });
    /* Nothing matched: somebody else took the last one between our read and
       our write. */
    if (claimed.count !== 1) return { ok: false, reason: "exhausted" };
  } else {
    await tx.coupon.update({
      where: { id: couponId },
      data: { redeemedCount: { increment: 1 } },
    });
  }

  const used = await tx.couponRedemption.count({ where: { couponId, userId } });
  if (coupon.perUserLimit > 0 && used >= coupon.perUserLimit) {
    return { ok: false, reason: "per_user_limit_reached" };
  }

  try {
    await tx.couponRedemption.create({
      data: { couponId, userId, orderId, useIndex: used + 1, discountPaise },
    });
  } catch {
    /* The unique constraint refused it. Either this customer's Nth use already
       exists — a concurrent order won — or this order already redeemed. Both
       mean: do not let this one through. */
    return { ok: false, reason: "per_user_limit_reached" };
  }

  return { ok: true };
}
