import { fail, type ActionResult } from "@/lib/validators";
import { couponNoLongerAppliesMessage, isCouponRefusal } from "@/lib/coupon-refusal";

/**
 * Turning a `placeOrder` service throw into a result the caller can render.
 *
 * Lifted out of `actions/checkout.ts` so the native API answers a refusal with
 * exactly the words and codes the storefront does. Pure: no database, no
 * Next.js.
 */
export const TOTAL_CHANGED_MESSAGE =
  "Your cart changed since this total was shown. Check the updated total, then place your order — nothing has been placed.";

/** True when a placement was refused because the cart moved since the quote. */
export const isTotalChangedError = (error: { metadata?: unknown }) =>
  (error.metadata as { totalChanged?: unknown } | undefined)?.totalChanged === true;

export function classifyPlaceOrderError<T>(e: unknown): ActionResult<T> {
  const msg = e instanceof Error ? e.message : "Could not place order";
  if (msg.startsWith("OUT_OF_STOCK:")) {
    return fail("OUT_OF_STOCK", `${msg.split(":")[1]} is out of stock`);
  }
  /* E6: the coupon the customer applied no longer qualifies. Nothing was placed.
     The metadata tells the screen to drop the coupon and re-quote; the customer
     then places again at the new total — or doesn't. */
  if (msg.startsWith("COUPON_NOT_APPLICABLE:")) {
    const reason = msg.slice("COUPON_NOT_APPLICABLE:".length);
    const refusal = isCouponRefusal(reason) ? reason : "not_found";
    return fail("COUPON_INVALID", couponNoLongerAppliesMessage(refusal), "couponCode", {
      couponRejected: true,
      reason: refusal,
    });
  }
  /* Lost the last use to an order placed at the same moment (the guarded
     redemption inside the order transaction). Everything the attempt wrote was
     rolled back; the same review-and-retry applies. */
  if (msg.startsWith("COUPON_UNAVAILABLE:")) {
    const refusal = msg.endsWith(":per_user_limit_reached") ? "per_user_limit_reached" : "usage_limit_reached";
    return fail("COUPON_INVALID", couponNoLongerAppliesMessage(refusal), "couponCode", {
      couponRejected: true,
      reason: refusal,
    });
  }
  /* E8: the cart changed (another tab, a sign-in merge, stock) since the
     total on screen was quoted. Nothing was placed; the screen re-reads the
     cart and shows the new total before the customer places again. */
  if (msg === "TOTAL_CHANGED") {
    return fail("CONFLICT", TOTAL_CHANGED_MESSAGE, undefined, { totalChanged: true });
  }
  if (msg === "PINCODE_UNSERVICEABLE") return fail("PINCODE_UNSERVICEABLE", "This pincode isn't serviceable");
  if (msg === "COD_UNAVAILABLE") return fail("CONFLICT", "Pay on delivery isn't available here");
  if (msg === "CART_EMPTY") return fail("CONFLICT", "Your cart is empty");
  if (msg === "ADDRESS_NOT_FOUND") return fail("NOT_FOUND", "Select a valid delivery address");
  return fail("PAYMENT_FAILED", "Something went wrong placing your order");
}
