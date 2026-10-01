import test from "node:test";
import assert from "node:assert/strict";
import { cancelErrorResult } from "@/lib/order-display";

/**
 * E5 — what the customer is told when "Cancel order" is refused because the
 * payment may have gone through. The web action returns exactly this.
 */

const SUPPORT = "support@example.invalid";

test("payment status unknown: not cancelled, try again, don't pay again — and no claim it is unpaid", () => {
  const r = cancelErrorResult("PAYMENT_STATUS_UNKNOWN", SUPPORT);
  assert.equal(r.code, "UNAVAILABLE");
  assert.match(r.message, /hasn’t been cancelled/);
  assert.match(r.message, /try again in a few minutes/i);
  assert.match(r.message, /don’t pay again/);
  assert.doesNotMatch(r.message, /not paid|unpaid|refund/i);
});

test("payment in progress (authorized): cannot cancel now, check back", () => {
  const r = cancelErrorResult("PAYMENT_IN_PROGRESS", SUPPORT);
  assert.equal(r.code, "CONFLICT");
  assert.match(r.message, /approved a payment/);
  assert.match(r.message, /can’t be cancelled right now/);
  assert.doesNotMatch(r.message, /refund/i);
});

test("paid (including one found paid at Razorpay during the cancel): paid, contact support", () => {
  const r = cancelErrorResult("PAID_NOT_CANCELLABLE", SUPPORT);
  assert.equal(r.code, "CONFLICT");
  assert.match(r.message, /paid/);
  assert.ok(r.message.includes(SUPPORT));
});

test("existing mappings unchanged; an unknown error is never reported as a payment state", () => {
  assert.deepEqual(cancelErrorResult("NOT_CANCELLABLE", SUPPORT), { code: "CONFLICT", message: "This order can no longer be cancelled" });
  assert.deepEqual(cancelErrorResult("NOT_FOUND", SUPPORT), { code: "NOT_FOUND", message: "Order not found" });
});
