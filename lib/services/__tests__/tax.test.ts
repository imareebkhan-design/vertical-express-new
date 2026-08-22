import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGst } from "../tax";

test("GST: Intra-state J&K splits 18% inclusive GST into equal CGST and SGST", () => {
  const inclusiveBase = 100000; // ₹1,000.00 inclusive of 18% GST
  const gst = computeGst(inclusiveBase, "Jammu & Kashmir", "painting"); // painting is 18%

  assert?.equal(gst?.intraState, true);
  assert?.equal(gst?.ratePct, 18);
  // taxableBase = Math.round(100000 * 100 / 118) = 84746
  // taxPaise = 100000 - 84746 = 15254
  assert?.equal(gst?.taxPaise, 15254);
  assert?.equal(gst?.cgstPaise, 7627);
  assert?.equal(gst?.sgstPaise, 7627);
  assert?.equal(gst?.igstPaise, 0);
  assert?.equal(gst?.cgstPaise + gst?.sgstPaise + gst?.igstPaise, gst?.taxPaise);
});

test("GST: Intra-state J&K splits 28% inclusive GST for cement", () => {
  const inclusiveBase = 100000; // ₹1,000.00 inclusive of 28% GST
  const gst = computeGst(inclusiveBase, "Jammu & Kashmir", "cement"); // cement is 28%

  assert?.equal(gst?.intraState, true);
  assert?.equal(gst?.ratePct, 28);
  // taxableBase = Math.round(100000 * 100 / 128) = 78125
  // taxPaise = 100000 - 78125 = 21875
  assert?.equal(gst?.taxPaise, 21875);
  // Split: sgst = floor(21875 / 2) = 10937, cgst = 21875 - 10937 = 10938
  assert?.equal(gst?.sgstPaise, 10937);
  assert?.equal(gst?.cgstPaise, 10938);
  assert?.equal(gst?.igstPaise, 0);
  assert?.equal(gst?.cgstPaise + gst?.sgstPaise + gst?.igstPaise, gst?.taxPaise);
});

test("GST: Intra-state handles odd paise inclusive tax by assigning remainder to CGST", () => {
  const inclusiveBase = 385; // ₹3.85 inclusive of 18% GST -> base = round(385 * 100 / 118) = 326 -> tax = 59
  const gst = computeGst(inclusiveBase, "Jammu & Kashmir", "painting");

  assert?.equal(gst?.taxPaise, 59);
  assert?.equal(gst?.sgstPaise, 29); // Math.floor(59 / 2)
  assert?.equal(gst?.cgstPaise, 30); // 59 - 29
  assert?.equal(gst?.cgstPaise + gst?.sgstPaise, gst?.taxPaise);
});

test("GST: Inter-state (outside J&K) assigns entire inclusive tax to IGST", () => {
  const inclusiveBase = 50000; // ₹500.00 inclusive of 18% GST -> base = round(50000 * 100 / 118) = 42373 -> tax = 7627
  const gst = computeGst(inclusiveBase, "Delhi", "tiling");

  assert?.equal(gst?.intraState, false);
  assert?.equal(gst?.taxPaise, 7627);
  assert?.equal(gst?.cgstPaise, 0);
  assert?.equal(gst?.sgstPaise, 0);
  assert?.equal(gst?.igstPaise, 7627);
  assert?.equal(gst?.igstPaise, gst?.taxPaise);
});

test("GST: Zero-value taxable base produces zero GST", () => {
  const gst = computeGst(0, "Jammu & Kashmir", "cement");

  assert?.equal(gst?.taxPaise, 0);
  assert?.equal(gst?.cgstPaise, 0);
  assert?.equal(gst?.sgstPaise, 0);
  assert?.equal(gst?.igstPaise, 0);
});
