import test from "node:test";
import assert from "node:assert/strict";
import { summaryPayment, summaryTotals } from "../order-summary";

/** Rupee lines as paise, so a test can add up what the page prints. */
const paise = (value: string) => (value === "FREE" ? 0 : Math.round(Number(value.replace(/[^\d.]/g, "")) * 100));
const printedSum = (lines: { value: string }[]) => lines.reduce((n, l) => n + paise(l.value), 0);

test("unpaid COD is not shown as paid, whatever the order status", () => {
  assert.equal(summaryPayment("cod", []), "Pay on delivery — cash not yet collected");
  assert.equal(summaryPayment("cod", [{ status: "created", amountPaise: 11800, refunds: [] }]), "Pay on delivery — cash not yet collected");
  assert.equal(summaryPayment("razorpay", [{ status: "created", amountPaise: 11800, refunds: [] }]), "Payment not recorded");
  assert.equal(summaryPayment("razorpay", [{ status: "failed", amountPaise: 11800, refunds: [] }]), "Payment not recorded");
  assert.equal(summaryPayment("razorpay", [{ status: "authorized", amountPaise: 11800, refunds: [] }]), "Payment authorised; capture not yet recorded");
});

test("captured, refunded and in-flight refund amounts come from the payment records", () => {
  assert.equal(summaryPayment("razorpay", [{ status: "captured", amountPaise: 19900, refunds: [] }]), "Paid online: ₹199");
  assert.equal(
    summaryPayment("razorpay", [{ status: "refunded", amountPaise: 19900, refunds: [{ status: "processed", amountPaise: 19900 }] }]),
    "Paid online: ₹199 · Refunded: ₹199"
  );
  assert.equal(
    summaryPayment("razorpay", [
      { status: "captured", amountPaise: 11800, refunds: [] },
      { status: "captured", amountPaise: 11800, refunds: [{ status: "pending", amountPaise: 11800 }] },
    ]),
    "Paid online: ₹236 · Refund in progress: ₹118"
  );
});

test("the audit's discounted order: printed lines add up to the stored total; the saving is not subtracted twice", () => {
  /* ₹118 inclusive item, ₹11.80 coupon, 18%: taxable ₹90 (already after the coupon), GST ₹16.20, total ₹106.20.
     The old summary printed ₹90 − ₹11.80 + ₹16.20 = ₹94.40 against a total of ₹106.20. */
  const view = summaryTotals({ subtotalPaise: 9000, discountPaise: 1180, taxPaise: 1620, deliveryFeePaise: 0, totalPaise: 10620 }, true);
  assert.equal(printedSum(view.lines), 10620);
  assert.equal(view.lines.some((l) => /discount/i.test(l.label)), false);
  assert.equal(view.discountNote, "Includes a coupon saving of ₹11.80");
  assert.equal(view.note, null);
});

test("mixed-rate tax prints one GST amount and no single rate", () => {
  /* 28% cement line + 18% line: one "18%" (or any one rate) label would be false. */
  const view = summaryTotals({ subtotalPaise: 20000, discountPaise: 0, taxPaise: 4600, deliveryFeePaise: 5000, totalPaise: 29600 }, true);
  assert.equal(printedSum(view.lines), 29600);
  assert.equal(view.lines.some((l) => /%/.test(l.label)), false);
});

test("an older order shows its stored tax, not a recomputed 18%, and says so", () => {
  const view = summaryTotals({ subtotalPaise: 10000, discountPaise: 0, taxPaise: 500, deliveryFeePaise: 0, totalPaise: 10500 }, false);
  assert.equal(view.lines.find((l) => l.label === "GST")?.value, "₹5");
  assert.match(view.note!, /per-item tax breakdown was not recorded/);
  assert.doesNotMatch(view.note!, /do not add up/);
});

test("an older order whose stored lines do not reconcile says that too", () => {
  const view = summaryTotals({ subtotalPaise: 10000, discountPaise: 1000, taxPaise: 0, deliveryFeePaise: 0, totalPaise: 9000 }, false);
  assert.equal(view.reconciles, false);
  assert.match(view.note!, /do not add up to the total charged/);
});
