/**
 * Why a coupon was refused, and what the customer is told.
 *
 * Pure and client-safe: the server's placement error, the checkout views and
 * the coupon preview all word a refusal the same way. The rules themselves live
 * in `lib/services/coupon-eligibility.ts`; nothing here decides eligibility.
 */

export type CouponRefusal =
  | "not_found"
  | "below_minimum"
  | "usage_limit_reached"
  | "per_user_limit_reached"
  | "not_within_first_orders";

const REFUSALS: readonly CouponRefusal[] = [
  "not_found",
  "below_minimum",
  "usage_limit_reached",
  "per_user_limit_reached",
  "not_within_first_orders",
];

export function isCouponRefusal(value: unknown): value is CouponRefusal {
  return typeof value === "string" && (REFUSALS as readonly string[]).includes(value);
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
 * Said when a coupon the customer had applied no longer qualifies at the moment
 * they place the order (it expired, was switched off or claimed out, or the
 * basket no longer meets its terms). The order was NOT placed; the total shown
 * has been recalculated without it, and they place again only if they accept it.
 */
/** Said when the checkout re-quotes and a coupon the customer had applied no
 *  longer qualifies (e.g. the basket changed). Nothing was placed. */
export function couponRemovedFromQuoteMessage(reason: CouponRefusal): string {
  const why =
    reason === "not_found" ? "This coupon is no longer valid" : refusalMessage(reason);
  return `${why}, so it has been removed. Your total has been updated.`;
}

/**
 * What the checkout screen does with a coupon refusal — from a placement
 * attempt or from a re-quote. Pure, so the rule is tested without rendering a
 * checkout: the screen drops the coupon, re-quotes, shows this, and does NOT
 * place anything until the customer presses the button again.
 */
export interface CouponRevision {
  kind: "placement" | "quote";
  reason: CouponRefusal;
  message: string;
  /** The total the customer saw with the coupon, for "was ₹X — now ₹Y". */
  previousTotalPaise: number | null;
}

export function couponRevisionFromPlaceError(
  error: { code: string; metadata?: unknown },
  previousTotalPaise: number | null
): CouponRevision | null {
  if (error.code !== "COUPON_INVALID") return null;
  const meta = (error.metadata ?? {}) as { couponRejected?: unknown; reason?: unknown };
  if (meta.couponRejected !== true) return null;
  const reason = isCouponRefusal(meta.reason) ? meta.reason : "not_found";
  return { kind: "placement", reason, message: couponNoLongerAppliesMessage(reason), previousTotalPaise };
}

export function couponRevisionFromQuote(
  totals: { couponRejection?: CouponRefusal | null },
  appliedCoupon: string | null,
  previousTotalPaise: number | null
): CouponRevision | null {
  if (!appliedCoupon || !totals.couponRejection) return null;
  const reason = totals.couponRejection;
  return { kind: "quote", reason, message: couponRemovedFromQuoteMessage(reason), previousTotalPaise };
}

export function couponNoLongerAppliesMessage(reason: CouponRefusal): string {
  const why =
    reason === "not_found" ? "This coupon is no longer valid" : refusalMessage(reason);
  return `${why}, so your order was not placed. Without the coupon your total may change — review the new total and place the order again if you want to continue.`;
}
