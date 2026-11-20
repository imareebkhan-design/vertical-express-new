import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render } from "@testing-library/react";
import { QuotePending } from "@/components/mobile/checkout/quote-pending";
import { couponNoLongerAppliesMessage, type CouponRevision } from "@/lib/coupon-refusal";

afterEach(cleanup);

/**
 * E6 on the phone — what the Order Summary says while no fresh quote exists.
 * The bottom bar (amount and "place order") is hidden then, so this card must
 * give the reason, and must not show an amount: none is current.
 *
 * Found at 390 px: a refused coupon's re-quote failed, and the card read
 * "Pincode serviceability details unavailable." — untrue — while the real
 * message sat scrolled out of sight at the top of the page.
 */

const QUOTE_FAILED =
  "We couldn't update your total. Check your connection and reload the page to try again — nothing has been placed.";

const refused: CouponRevision = {
  kind: "placement",
  reason: "not_found",
  message: couponNoLongerAppliesMessage("not_found"),
  previousTotalPaise: 41980,
};

test("re-quote failed after a refused coupon: why, that nothing was placed, and what to do — no amount, no pincode claim", () => {
  const { getByRole, container } = render(<QuotePending loading={false} failure={QUOTE_FAILED} revision={refused} />);
  const text = getByRole("alert").textContent ?? "";
  assert.match(text, /your order was not placed/);
  assert.match(text, /We couldn't update your total/);
  assert.match(text, /reload the page/);
  assert.match(text, /nothing has been placed/);
  assert.doesNotMatch(container.textContent ?? "", /Pincode serviceability/);
  assert.doesNotMatch(container.textContent ?? "", /Updating your total/, "a failed quote is not still updating");
  assert.doesNotMatch(container.textContent ?? "", /₹/, "no amount while none is current");
});

test("a failed quote without a coupon still says so, rather than blaming the pincode", () => {
  const { getByRole, container } = render(<QuotePending loading={false} failure={QUOTE_FAILED} revision={null} />);
  assert.match(getByRole("alert").textContent ?? "", /We couldn't update your total/);
  assert.doesNotMatch(container.textContent ?? "", /Pincode serviceability|₹/);
});

test("re-quote in flight after a refused coupon: the order was not placed, the total is updating, nothing charged — no amount", () => {
  const { getByRole, container } = render(<QuotePending loading failure={null} revision={refused} />);
  const text = getByRole("alert").textContent ?? "";
  assert.match(text, /your order was not placed/);
  assert.match(text, /Updating your total…/);
  assert.match(text, /Nothing has been charged\./);
  assert.doesNotMatch(container.textContent ?? "", /₹/, "the old ₹419.80 is not shown as current");
});

test("unchanged otherwise: loading reads 'Calculating totals', no quote reads the pincode message", () => {
  const loading = render(<QuotePending loading failure={null} revision={null} />);
  assert.match(loading.container.textContent ?? "", /Calculating totals/);
  cleanup();
  const none = render(<QuotePending loading={false} failure={null} revision={null} />);
  assert.match(none.container.textContent ?? "", /Pincode serviceability details unavailable\./);
});
