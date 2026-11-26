import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render } from "@testing-library/react";
import { CheckoutSummaryLines, type SummaryTotals } from "@/components/shop/checkout/summary-lines";

afterEach(cleanup);

/**
 * The checkout breakdown must add up to what is charged.
 *
 * `computeTotals` returns `subtotalPaise` as the TAXABLE value — after the
 * coupon, excluding GST — and `totalPaise = subtotalPaise + taxPaise +
 * deliveryFeePaise`. The phone checkout printed that taxable value as
 * "Subtotal", called the GST "included", and subtracted the coupon a second
 * time, so its lines did not reconcile with its own total. These fixtures are
 * worked with the server's arithmetic (inclusive prices, GST extracted per
 * line, the coupon apportioned across lines by value, remainder to the last).
 */

/** ₹320 cement at 28% GST (inclusive), ₹49 delivery, no coupon — the 28 Sep TEST order. */
const single: SummaryTotals = {
  subtotalPaise: 25000, // 32000 − 7000
  taxPaise: 7000,       // 32000 × 28/128
  discountPaise: 0,
  deliveryFeePaise: 4900,
  totalPaise: 36900,
  serviceable: true,
};

/** Mixed rates: ₹320 cement at 28% + ₹118 fitting at 18%, no coupon. */
const mixed: SummaryTotals = {
  subtotalPaise: 35000, // 25000 + 10000
  taxPaise: 8800,       // 7000 + 1800
  discountPaise: 0,
  deliveryFeePaise: 4900,
  totalPaise: 48700,
  serviceable: true,
};

/**
 * Mixed rates with a 10% coupon (₹43.80): 3200 on the cement line, the 1180
 * remainder on the fitting. Cement 28800 incl → 6300 tax; fitting 10620 incl
 * → 1620 tax. Taxable 22500 + 9000.
 */
const mixedDiscounted: SummaryTotals = {
  subtotalPaise: 31500,
  taxPaise: 7920,
  discountPaise: 4380,
  deliveryFeePaise: 4900,
  totalPaise: 44320,
  serviceable: true,
};

const rupees = (s: string) => Math.round(Number(s.replace(/[^\d.]/g, "")) * 100);

function lines(totals: SummaryTotals, variant: "desktop" | "phone") {
  const { container } = render(
    <dl>
      <CheckoutSummaryLines totals={totals} variant={variant} />
    </dl>
  );
  const rows = new Map<string, string>();
  for (const dt of container.querySelectorAll("dt")) {
    rows.set(dt.textContent?.trim() ?? "", dt.nextElementSibling?.textContent?.trim() ?? "");
  }
  return rows;
}

for (const variant of ["desktop", "phone"] as const) {
  for (const [name, totals] of [
    ["single rate, no coupon", single],
    ["mixed rates, no coupon", mixed],
    ["mixed rates, coupon", mixedDiscounted],
  ] as const) {
    test(`${variant}: ${name} — the lines add up to the amount charged`, () => {
      const rows = lines(totals, variant);
      const subtotal = rupees(rows.get("Subtotal") ?? "");
      const discountRow = [...rows.entries()].find(([k]) => /discount/i.test(k));
      const discount = discountRow ? rupees(discountRow[1]) : 0;
      const delivery = rupees([...rows.entries()].find(([k]) => /delivery/i.test(k))?.[1] ?? "");

      assert.equal(
        subtotal - discount + delivery,
        totals.totalPaise,
        `Subtotal − discount + delivery must equal the total: ${JSON.stringify([...rows])}`
      );
      assert.equal(subtotal, totals.subtotalPaise + totals.taxPaise + totals.discountPaise,
        "Subtotal is the items at their GST-inclusive prices, before the coupon");
      assert.equal(discount, totals.discountPaise, "the coupon appears exactly once");
      assert.equal(!!discountRow, totals.discountPaise > 0, "a discount row only when there is a discount");
      assert.equal(rupees(rows.get("GST (included)") ?? ""), totals.taxPaise,
        "the GST shown is the server's tax, and it is inside the subtotal");
    });
  }

  test(`${variant}: the taxable value is never shown as the subtotal`, () => {
    const rows = lines(mixedDiscounted, variant);
    assert.notEqual(rupees(rows.get("Subtotal") ?? ""), mixedDiscounted.subtotalPaise);
  });
}
