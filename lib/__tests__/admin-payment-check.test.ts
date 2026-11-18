import test from "node:test";
import assert from "node:assert/strict";
import { adminPaymentCheckMessage, canCheckPayment, type AdminPaymentCheckResult } from "@/lib/admin-payment-check";

/**
 * B-4 — what an operator is told after "Check payment", and when the button is
 * offered. The rule for the wording: every answer says whether anything
 * changed, and only an answer that changed the order asks the page to reload.
 */

const ALL: AdminPaymentCheckResult[] = [
  "paid", "late", "not_captured", "in_progress", "unknown", "unconfigured", "not_pending", "no_gateway_order",
];

test("only a confirmed or late-recorded payment, or a stale page, is reported as a change", () => {
  const changed = ALL.filter((r) => adminPaymentCheckMessage(r).changed).sort();
  assert.deepEqual(changed, ["late", "not_pending", "paid"]);
});

test("every answer that changed nothing says so", () => {
  for (const r of ALL.filter((x) => !adminPaymentCheckMessage(x).changed)) {
    assert.match(adminPaymentCheckMessage(r).message, /Nothing was changed|no Razorpay payment to check/, r);
  }
});

test("an approved-but-not-captured payment tells the operator not to ask the customer to pay again", () => {
  /* The one answer that, misread, takes a customer's money twice. */
  assert.match(adminPaymentCheckMessage("in_progress").message, /do not ask the customer to pay again/);
});

test("the late answer does not claim the order was confirmed", () => {
  const m = adminPaymentCheckMessage("late").message;
  assert.match(m, /refund review/);
  assert.doesNotMatch(m, /now confirmed/);
});

test("the button is offered only on an order awaiting payment with an uncaptured Razorpay order", () => {
  const rp = (status = "created", gatewayOrderId: string | null = "order_x") => ({ gateway: "razorpay", gatewayOrderId, status });
  assert.equal(canCheckPayment({ status: "pending_payment", payments: [rp()] }), true);
  assert.equal(canCheckPayment({ status: "pending_payment", payments: [rp("failed")] }), true, "a failed attempt can still be followed by a capture");

  assert.equal(canCheckPayment({ status: "confirmed", payments: [rp()] }), false, "not awaiting payment");
  assert.equal(canCheckPayment({ status: "cancelled", payments: [rp()] }), false);
  assert.equal(canCheckPayment({ status: "pending_payment", payments: [] }), false, "cash on delivery");
  assert.equal(canCheckPayment({ status: "pending_payment", payments: [rp("created", null)] }), false, "no Razorpay order to ask about");
  assert.equal(canCheckPayment({ status: "pending_payment", payments: [rp("captured")] }), false, "already recorded as captured");
  assert.equal(
    canCheckPayment({ status: "pending_payment", payments: [{ gateway: "dummy", gatewayOrderId: "dummy_1", status: "created" }] }),
    false,
    "another gateway's order is not Razorpay's to answer"
  );
});
