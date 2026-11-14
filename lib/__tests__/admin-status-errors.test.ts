import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STATUS_FAULT, bookingStatusRefusal, orderStatusRefusal } from "@/lib/admin-status-errors";

/**
 * Audit of 14 Nov 2026 (ORD-04): a refused status change reached the operator
 * as a bare "!", and an unexpected fault as "Order not found". Every refusal
 * the service can raise must have its own sentence, and a fault must not be
 * dressed up as a missing order.
 */

test("every refusal advanceOrderStatus and advanceBookingStatus can throw has a sentence", () => {
  const source = readFileSync(new URL("../services/admin/manage.ts", import.meta.url), "utf8");
  const thrown = [...source.matchAll(/throw new Error\("([A-Z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(thrown.length >= 9, "the service's refusal codes were found");
  for (const code of new Set(thrown)) {
    const told = orderStatusRefusal(new Error(code)) ?? bookingStatusRefusal(new Error(code));
    assert.ok(told, `${code} has no operator message`);
    assert.ok(told.message.length > 10 && /[a-z]/.test(told.message), `${code} reads as a sentence`);
  }
});

test("a payment found while cancelling tells the operator what happened and what to do next", () => {
  const told = orderStatusRefusal(new Error("PAYMENT_FOUND"));
  assert.match(told!.message, /was paid, so it was not cancelled/);
  assert.match(told!.message, /refund it from Payments/);
  assert.equal(told!.changedSomething, true, "the order was confirmed by the check, so lists are re-read");
});

test("an unexpected fault is not reported as a missing order", () => {
  for (const fault of [new Error("connect ECONNREFUSED"), new Error(""), "string", null]) {
    assert.equal(orderStatusRefusal(fault), null);
    assert.equal(bookingStatusRefusal(fault), null);
  }
  assert.equal(STATUS_FAULT.code, "UNAVAILABLE");
  assert.doesNotMatch(STATUS_FAULT.message, /not found/i);
  assert.match(STATUS_FAULT.message, /Reload to see whether it changed/, "post-commit steps can fail after the status is saved");
});

test("only a missing record is reported as not found", () => {
  assert.equal(orderStatusRefusal(new Error("NOT_FOUND"))!.message, "Order not found");
  assert.equal(bookingStatusRefusal(new Error("NOT_FOUND"))!.message, "Booking not found");
});
