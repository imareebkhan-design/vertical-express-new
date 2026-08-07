import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGst } from "../tax";

test("GST: Intra-state J&K splits 18% into equal CGST and SGST", () => {
  const taxableBase = 100000; // ₹1,000.00
  const gst = computeGst(taxableBase, "Jammu & Kashmir");

  assert.equal(gst.intraState, true);
  assert.equal(gst.ratePct, 18);
  assert.equal(gst.taxPaise, 18000); // 18% of 100000
  assert.equal(gst.cgstPaise, 9000);
  assert.equal(gst.sgstPaise, 9000);
  assert.equal(gst.igstPaise, 0);
  assert.equal(gst.cgstPaise + gst.sgstPaise + gst.igstPaise, gst.taxPaise);
});

test("GST: Intra-state handles odd paise tax by assigning remainder to CGST", () => {
  const taxableBase = 385; // ₹3.85 -> 18% = 69.3 -> rounded to 69 paise
  const gst = computeGst(taxableBase, "Jammu & Kashmir");

  assert.equal(gst.taxPaise, 69);
  assert.equal(gst.sgstPaise, 34); // Math.floor(69 / 2)
  assert.equal(gst.cgstPaise, 35); // 69 - 34
  assert.equal(gst.cgstPaise + gst.sgstPaise, gst.taxPaise);
});

test("GST: Inter-state (outside J&K) assigns entire tax to IGST", () => {
  const taxableBase = 50000; // ₹500.00
  const gst = computeGst(taxableBase, "Delhi");

  assert.equal(gst.intraState, false);
  assert.equal(gst.taxPaise, 9000);
  assert.equal(gst.cgstPaise, 0);
  assert.equal(gst.sgstPaise, 0);
  assert.equal(gst.igstPaise, 9000);
  assert.equal(gst.igstPaise, gst.taxPaise);
});

test("GST: Zero-value taxable base produces zero GST", () => {
  const gst = computeGst(0, "Jammu & Kashmir");

  assert.equal(gst.taxPaise, 0);
  assert.equal(gst.cgstPaise, 0);
  assert.equal(gst.sgstPaise, 0);
  assert.equal(gst.igstPaise, 0);
});
