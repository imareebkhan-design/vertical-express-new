import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGst } from "../tax";

test("Checkout Math: Proportional discount and inclusive GST extraction on multi-item cart", () => {
  // Mock cart lines
  const lines = [
    { title: "Cement", qty: 10, lineTotalPaise: 385000, categorySlug: "cement" }, // ₹3,850.00 inclusive of 28% GST
    { title: "Paint", qty: 2, lineTotalPaise: 309800, categorySlug: "painting" },  // ₹3,098.00 inclusive of 18% GST
  ];

  const subtotalPaise = 385000 + 309800; // ₹6,948.00
  const discountPaise = 100000;          // ₹1,000.00 coupon discount

  // Extract totals using the same logic as computeTotals
  let remainingDiscount = discountPaise;
  let totalTaxableValuePaise = 0;
  let totalTaxPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;

  const linesCount = lines?.length;
  const lineDetails = lines?.map((line, idx) => {
    const lineSubtotal = line?.lineTotalPaise;
    let lineDiscount = 0;
    if (subtotalPaise > 0) {
      if (idx === linesCount - 1) {
        lineDiscount = remainingDiscount;
      } else {
        lineDiscount = Math.round((lineSubtotal * discountPaise) / subtotalPaise);
        remainingDiscount -= lineDiscount;
      }
    }
    const lineInclusiveTotal = Math.max(0, lineSubtotal - lineDiscount);
    const lineGst = computeGst(lineInclusiveTotal, "Jammu & Kashmir", line?.categorySlug);

    totalTaxPaise += lineGst?.taxPaise;
    totalCgstPaise += lineGst?.cgstPaise;
    totalSgstPaise += lineGst?.sgstPaise;
    totalIgstPaise += lineGst?.igstPaise;
    totalTaxableValuePaise += (lineInclusiveTotal - lineGst?.taxPaise);

    return {
      title: line?.title,
      lineDiscount,
      lineInclusiveTotal,
      tax: lineGst?.taxPaise,
      taxable: lineInclusiveTotal - lineGst?.taxPaise,
    };
  });

  // Assert proportional discount allocations:
  // Cement discount: round(385000 * 100000 / 694800) = round(55411.6) = 55412 paise
  // Paint discount: 100000 - 55412 = 44588 paise
  assert?.equal(lineDetails?.[0]?.lineDiscount, 55412);
  assert?.equal(lineDetails?.[1]?.lineDiscount, 44588);
  assert?.equal(lineDetails?.[0]?.lineDiscount + lineDetails?.[1]?.lineDiscount, discountPaise);

  // Assert inclusive GST extractions:
  // Cement net total: 385000 - 55412 = 329588 paise
  // Cement GST (28%): 329588 - round(329588 * 100 / 128) = 329588 - 257491 = 72097 paise
  assert?.equal(lineDetails?.[0]?.lineInclusiveTotal, 329588);
  assert?.equal(lineDetails?.[0]?.tax, 72097);
  assert?.equal(lineDetails?.[0]?.taxable, 257491);

  // Paint net total: 309800 - 44588 = 265212 paise
  // Paint GST (18%): 265212 - round(265212 * 100 / 118) = 265212 - 224756 = 40456 paise
  assert?.equal(lineDetails?.[1]?.lineInclusiveTotal, 265212);
  assert?.equal(lineDetails?.[1]?.tax, 40456);
  assert?.equal(lineDetails?.[1]?.taxable, 224756);

  // Order level aggregates:
  assert?.equal(totalTaxPaise, 72097 + 40456); // 112553 paise
  assert?.equal(totalCgstPaise, 36049 + 20228); // 56277 paise
  assert?.equal(totalSgstPaise, 36048 + 20228); // 56276 paise
  assert?.equal(totalIgstPaise, 0);
  assert?.equal(totalTaxableValuePaise, 257491 + 224756); // 482247 paise
  assert?.equal(totalTaxableValuePaise + totalTaxPaise, subtotalPaise - discountPaise); // ₹5,948.00 exactly!
});
