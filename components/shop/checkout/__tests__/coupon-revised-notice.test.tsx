import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render } from "@testing-library/react";
import { CouponRevisedNotice } from "@/components/shop/checkout/coupon-revised-notice";
import { couponNoLongerAppliesMessage, couponRemovedFromQuoteMessage, type CouponRevision } from "@/lib/coupon-refusal";

afterEach(cleanup);

/**
 * E6 — the notice both checkouts show when an applied coupon stops qualifying.
 * The customer must see why, what they would now pay next to what they saw,
 * and — after a refused placement — that nothing was charged.
 */

const placement: CouponRevision = {
  kind: "placement",
  reason: "usage_limit_reached",
  message: couponNoLongerAppliesMessage("usage_limit_reached"),
  previousTotalPaise: 41980,
};

for (const variant of ["desktop", "phone"] as const) {
  test(`${variant}: after a refused placement — why, was vs now from the fresh quote, nothing charged`, () => {
    const { getByRole } = render(<CouponRevisedNotice revision={placement} currentTotalPaise={46100} variant={variant} />);
    const alert = getByRole("alert");
    const text = alert.textContent ?? "";
    assert.match(text, /This coupon has been fully claimed/);
    assert.match(text, /your order was not placed/);
    assert.match(text, /Total was ₹419\.80 — now ₹461/);
    assert.match(text, /Nothing has been charged\./);
    assert.ok(alert.querySelector("s"), "the old total is struck through");
  });

  test(`${variant}: while the fresh quote loads, no new figure is claimed`, () => {
    const { getByRole } = render(<CouponRevisedNotice revision={placement} currentTotalPaise={null} variant={variant} />);
    const text = getByRole("alert").textContent ?? "";
    assert.match(text, /Updating your total…/);
    assert.doesNotMatch(text, /now ₹/);
  });
}

test("a re-quote revision (basket changed) says it was removed and does not claim anything about charging", () => {
  const quote: CouponRevision = {
    kind: "quote",
    reason: "below_minimum",
    message: couponRemovedFromQuoteMessage("below_minimum"),
    previousTotalPaise: 64000,
  };
  const { getByRole } = render(<CouponRevisedNotice revision={quote} currentTotalPaise={36900} variant="phone" />);
  const text = getByRole("alert").textContent ?? "";
  assert.match(text, /below this coupon's minimum, so it has been removed/);
  assert.match(text, /Total was ₹640 — now ₹369/);
  assert.doesNotMatch(text, /charged/);
});

test("same total after removal (e.g. a free-delivery coupon that saved nothing): no false 'was'", () => {
  const { getByRole } = render(
    <CouponRevisedNotice revision={{ ...placement, previousTotalPaise: 36900 }} currentTotalPaise={36900} variant="desktop" />
  );
  const text = getByRole("alert").textContent ?? "";
  assert.match(text, /Total now ₹369/);
  assert.doesNotMatch(text, /Total was/);
});
