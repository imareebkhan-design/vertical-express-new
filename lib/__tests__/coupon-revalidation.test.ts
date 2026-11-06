import test from "node:test";
import assert from "node:assert/strict";
import { classifyPlaceOrderError } from "@/lib/checkout-errors";
import {
  couponNoLongerAppliesMessage,
  couponRevisionFromPlaceError,
  couponRevisionFromQuote,
  refusalMessage,
} from "@/lib/coupon-refusal";

/**
 * E6 — what the checkout is told when a coupon stops qualifying at placement,
 * and what it does with that. Pure: the same functions the storefront action,
 * the native API and both checkout screens use.
 */

test("a placement refusal becomes an actionable COUPON_INVALID with the reason, for web and app alike", () => {
  const r = classifyPlaceOrderError(new Error("COUPON_NOT_APPLICABLE:below_minimum"));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "COUPON_INVALID");
  assert.equal(r.error.field, "couponCode");
  assert.deepEqual(r.error.metadata, { couponRejected: true, reason: "below_minimum" });
  assert.match(r.error.message, /below this coupon's minimum/);
  assert.match(r.error.message, /your order was not placed/);
  assert.match(r.error.message, /review the new total and place the order again/);
});

test("an expired or switched-off coupon reads as 'no longer valid', not 'not valid'", () => {
  const r = classifyPlaceOrderError(new Error("COUPON_NOT_APPLICABLE:not_found"));
  assert.ok(!r.ok && /^This coupon is no longer valid/.test(r.error.message));
});

test("losing the last use to a concurrent order is the same actionable refusal, not 'something went wrong'", () => {
  for (const [msg, reason] of [
    ["COUPON_UNAVAILABLE:exhausted", "usage_limit_reached"],
    ["COUPON_UNAVAILABLE:per_user_limit_reached", "per_user_limit_reached"],
  ] as const) {
    const r = classifyPlaceOrderError(new Error(msg));
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.equal(r.error.code, "COUPON_INVALID");
    assert.deepEqual(r.error.metadata, { couponRejected: true, reason });
    assert.equal(r.error.message, couponNoLongerAppliesMessage(reason));
  }
});

test("an unrecognised reason still refuses safely", () => {
  const r = classifyPlaceOrderError(new Error("COUPON_NOT_APPLICABLE:something_new"));
  assert.ok(!r.ok && r.error.code === "COUPON_INVALID");
});

test("other placement errors are untouched", () => {
  const r = classifyPlaceOrderError(new Error("OUT_OF_STOCK:Cement"));
  assert.ok(!r.ok && r.error.code === "OUT_OF_STOCK");
  const g = classifyPlaceOrderError(new Error("anything else"));
  assert.ok(!g.ok && g.error.code === "PAYMENT_FAILED");
});

test("the screen turns a coupon refusal into a revision, keeping the total the customer saw", () => {
  const rev = couponRevisionFromPlaceError(
    { code: "COUPON_INVALID", metadata: { couponRejected: true, reason: "usage_limit_reached" } },
    41980
  );
  assert.deepEqual(rev, {
    kind: "placement",
    reason: "usage_limit_reached",
    message: couponNoLongerAppliesMessage("usage_limit_reached"),
    previousTotalPaise: 41980,
  });
  /* Anything else is not a coupon revision: the screen shows the error as before. */
  assert.equal(couponRevisionFromPlaceError({ code: "OUT_OF_STOCK" }, 100), null);
  assert.equal(couponRevisionFromPlaceError({ code: "COUPON_INVALID", metadata: {} }, 100), null);
});

test("a re-quote that drops an applied coupon is a revision; no coupon or an applied one is not", () => {
  assert.deepEqual(couponRevisionFromQuote({ couponRejection: "below_minimum" }, "SAVE10", 41980), {
    kind: "quote",
    reason: "below_minimum",
    message: `${refusalMessage("below_minimum")}, so it has been removed. Your total has been updated.`,
    previousTotalPaise: 41980,
  });
  assert.equal(couponRevisionFromQuote({ couponRejection: null }, "SAVE10", 1), null);
  assert.equal(couponRevisionFromQuote({ couponRejection: "not_found" }, null, 1), null);
});
