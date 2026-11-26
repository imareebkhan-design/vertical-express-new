import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/prisma/generated/client/client";
import {
  cancelErrorResult,
  checkoutQuote,
  customerCancelState,
  etaLine,
  etaShort,
  itemCountLabel,
  orderTotals,
  paymentLabel,
  withPlainGstRate,
} from "@/lib/order-display";

/* W-01 — a paid order must not be self-cancellable while nothing refunds it. */

test("an order paid online cannot be cancelled by the customer", () => {
  assert.equal(customerCancelState({ status: "confirmed", paymentMethod: "online", paymentStatus: "captured" }).kind, "paid-online");
  assert.equal(customerCancelState({ status: "confirmed", paymentMethod: "online" }).kind, "paid-online");
});

test("a payment captured late on a still-pending order also blocks self-cancel", () => {
  assert.equal(customerCancelState({ status: "pending_payment", paymentMethod: "online", paymentStatus: "captured" }).kind, "paid-online");
  assert.equal(customerCancelState({ status: "pending_payment", paymentMethod: "razorpay", paymentStatus: "authorized" }).kind, "paid-online");
});

test("unpaid orders stay cancellable: awaiting payment, or cash on delivery before dispatch", () => {
  assert.equal(customerCancelState({ status: "pending_payment", paymentMethod: "online", paymentStatus: "created" }).kind, "allowed");
  assert.equal(customerCancelState({ status: "confirmed", paymentMethod: "cod" }).kind, "allowed");
});

test("a payment row showing funds wins over a cash-on-delivery label", () => {
  assert.equal(customerCancelState({ status: "confirmed", paymentMethod: "cod", paymentStatus: "captured" }).kind, "paid-online");
  assert.equal(customerCancelState({ status: "pending_payment", paymentMethod: "cod", paymentStatus: "authorized" }).kind, "paid-online");
});

test("the action reports a paid-order refusal as a conflict, never as not found", () => {
  const paid = cancelErrorResult("PAID_NOT_CANCELLABLE", "help@example.test");
  assert.equal(paid.code, "CONFLICT");
  assert.match(paid.message, /is paid, so it can’t be cancelled here/);
  assert.match(paid.message, /help@example\.test/);
  assert.doesNotMatch(paid.message, /refund/i, "no refund may be promised");
  assert.deepEqual(cancelErrorResult("NOT_CANCELLABLE", "x"), { code: "CONFLICT", message: "This order can no longer be cancelled" });
  assert.equal(cancelErrorResult("NOT_FOUND", "x").code, "NOT_FOUND");
});

test("nothing past confirmed is cancellable, paid or not", () => {
  for (const status of ["packed", "out_for_delivery", "delivered", "cancelled"]) {
    assert.equal(customerCancelState({ status, paymentMethod: "cod" }).kind, "not-cancellable");
  }
});

test("the payment line says what happened, not which method was picked", () => {
  assert.equal(paymentLabel({ status: "pending_payment", paymentMethod: "online", paymentStatus: "created" }), "Awaiting payment");
  assert.equal(paymentLabel({ status: "cancelled", paymentMethod: "online", paymentStatus: "failed" }), "Not paid");
  assert.equal(paymentLabel({ status: "confirmed", paymentMethod: "online", paymentStatus: "captured" }), "Paid online");
  assert.equal(paymentLabel({ status: "confirmed", paymentMethod: "cod" }), "Pay on delivery");
});

/* W-02 — no minute estimate for a shipment that travels by truck. */

const MIXED = [{ speedClass: "express" as const }, { speedClass: "scheduled" as const }];

test("a mixed order never states a minute estimate for the whole order", () => {
  const line = etaLine({ status: "confirmed", etaMinutes: 120 }, MIXED);
  assert.ok(line, "the quick shipment keeps its quote");
  assert.match(line!, /^Quick-delivery items:/);
  assert.match(line!, /Truck items have no time set yet\./);
  assert.doesNotMatch(line!, /~\s*120|120 min/);
});

test("a truck-only order states no time at all", () => {
  assert.equal(etaLine({ status: "confirmed", etaMinutes: 120 }, [{ speedClass: "scheduled" }]), null);
});

test("an express-only order keeps the quote, worded as a quote from dispatch", () => {
  assert.equal(
    etaLine({ status: "confirmed", etaMinutes: 120 }, [{ speedClass: "express" }]),
    "About 2 hours from dispatch, as quoted at checkout."
  );
});

test("checkout states the quote only where it applies", () => {
  assert.equal(checkoutQuote(120, [{ speedClass: "express" }]), "About 2 hours from dispatch.");
  assert.equal(checkoutQuote(120, [{ speedClass: "scheduled" }]), null);
  assert.match(checkoutQuote(120, MIXED)!, /^Quick-delivery items: about 2 hours from dispatch\. Truck items have no time set yet\.$/);
  assert.equal(checkoutQuote(null, [{ speedClass: "express" }]), null);
});

test("the compact tile follows the same rule", () => {
  assert.equal(etaShort({ status: "confirmed", etaMinutes: 120 }, MIXED), "Quick items: about 2 hours");
  assert.equal(etaShort({ status: "confirmed", etaMinutes: 120 }, [{ speedClass: "scheduled" }]), "Not scheduled yet");
  assert.equal(etaShort({ status: "confirmed", etaMinutes: 45 }, []), "About 45 minutes");
  assert.equal(etaShort({ status: "pending_payment", etaMinutes: 45 }, []), "Not scheduled yet");
});

test("no estimate once delivered, cancelled, or before payment", () => {
  for (const status of ["delivered", "cancelled", "pending_payment"]) {
    assert.equal(etaLine({ status, etaMinutes: 60 }, []), null);
  }
});

/* W-08 — the lines shown must add up to the total shown. */

test("the breakdown of the audited order reconciles: subtotal + GST + delivery = total", () => {
  const t = orderTotals({ subtotalPaise: 708813, discountPaise: 0, taxPaise: 130087, deliveryFeePaise: 0, totalPaise: 838900 });
  assert.deepEqual(t.lines.map((l) => l.label), ["Subtotal (before GST)", "GST", "Delivery"]);
  assert.equal(t.reconciles, true);
  assert.equal(t.discountNote, null);
});

test("a coupon is reported, not subtracted a second time", () => {
  // computeTotals stores the post-coupon taxable value as the subtotal.
  const t = orderTotals({ subtotalPaise: 80000, discountPaise: 20000, taxPaise: 14400, deliveryFeePaise: 5000, totalPaise: 99400 });
  assert.equal(t.reconciles, true);
  assert.match(t.discountNote!, /coupon saving/);
  assert.ok(!t.lines.some((l) => /discount/i.test(l.label)), "no discount line to subtract");
});

test("no GST rate is printed — rates differ by category", () => {
  const t = orderTotals({ subtotalPaise: 100, discountPaise: 0, taxPaise: 28, deliveryFeePaise: 0, totalPaise: 128 });
  assert.ok(t.lines.every((l) => !/%/.test(l.label)));
});

/* W-09 — one meaning of "items", and correct plurals. */

test("items count units, the cart's own definition", () => {
  assert.equal(itemCountLabel([{ qty: 2 }]), "2 items");
  assert.equal(itemCountLabel([{ qty: 1 }, { qty: 1 }, { qty: 3 }]), "5 items");
});

test("one item is singular", () => {
  assert.equal(itemCountLabel([{ qty: 1 }]), "1 item");
});

test("an order crosses to a client component with plain numbers, not Prisma Decimals", () => {
  const order = {
    orderNo: "VE-1",
    items: [
      { title: "Cement", gstRate: new Prisma.Decimal("28.00") },
      { title: "Wire", gstRate: new Prisma.Decimal("18") },
      { title: "Legacy", gstRate: null },
    ],
  };
  const plain = withPlainGstRate(order);
  assert.deepEqual(plain.items.map((i) => i.gstRate), [28, 18, null]);
  assert.ok(plain.items.every((i) => i.gstRate === null || typeof i.gstRate === "number"));
  assert.equal(plain.orderNo, "VE-1");
  assert.equal(order.items[0].gstRate instanceof Prisma.Decimal, true, "the input is not mutated");
});
