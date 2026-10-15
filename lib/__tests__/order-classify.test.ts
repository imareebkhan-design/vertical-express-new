import test from "node:test";
import assert from "node:assert/strict";
import { fulfilmentState, orderTabs, paymentState } from "@/lib/order-classify";

const o = (status: string, method: string, pays: string[], ships: string[]) => ({
  status, paymentMethod: method, payments: pays.map((s) => ({ status: s })), shipments: ships.map((s) => ({ status: s })),
});

test("payment is its own dimension", () => {
  assert.equal(paymentState(o("confirmed", "razorpay", ["captured"], ["pending"])), "paid");
  assert.equal(paymentState(o("confirmed", "razorpay", ["failed", "captured"], [])), "paid", "a capture is not hidden by a failed retry");
  assert.equal(paymentState(o("pending_payment", "razorpay", ["created"], [])), "pending");
  assert.equal(paymentState(o("pending_payment", "razorpay", ["failed"], [])), "failed");
  assert.equal(paymentState(o("cancelled", "razorpay", ["created"], [])), "unpaid");
  assert.equal(paymentState(o("confirmed", "cod", ["created"], [])), "cod");
  assert.equal(paymentState(o("cancelled", "razorpay", ["captured", "refunded"], [])), "refunded");
});

test("fulfilment comes from shipments; one of two delivered is partial, never delivered", () => {
  assert.equal(fulfilmentState(o("out_for_delivery", "razorpay", ["captured"], ["delivered", "pending"])), "partial");
  assert.equal(fulfilmentState(o("delivered", "razorpay", ["captured"], ["delivered", "delivered"])), "delivered");
  assert.equal(fulfilmentState(o("delivered", "razorpay", ["captured"], ["delivered", "cancelled"])), "delivered");
  assert.equal(fulfilmentState(o("confirmed", "razorpay", ["captured"], ["packed", "pending"])), "unfulfilled");
  assert.equal(fulfilmentState(o("packed", "razorpay", ["captured"], ["packed", "packed"])), "ready");
  assert.equal(fulfilmentState(o("out_for_delivery", "razorpay", ["captured"], ["out_for_delivery", "packed"])), "in_transit");
  /* Delivered before the roll-up existed: status still confirmed, shipment delivered. Reported as it is. */
  assert.equal(fulfilmentState(o("confirmed", "razorpay", ["captured"], ["delivered"])), "delivered");
  assert.equal(fulfilmentState(o("cancelled", "razorpay", ["captured"], ["delivered"])), "cancelled");
  assert.equal(fulfilmentState(o("packed", "cod", [], [])), "ready", "orders before shipments read from status");
});

test("queues: an order with one shipment on the road and one to pack is in both", () => {
  assert.deepEqual(orderTabs(o("out_for_delivery", "razorpay", ["captured"], ["out_for_delivery", "pending"])), ["all", "to_pack", "in_transit"]);
  assert.deepEqual(orderTabs(o("pending_payment", "razorpay", [], ["pending"])), ["all", "awaiting_payment"], "not packable before payment");
  assert.deepEqual(orderTabs(o("refunded", "razorpay", ["refunded"], [])), ["all", "cancelled"]);
});
