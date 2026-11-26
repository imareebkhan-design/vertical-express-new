import { test } from "node:test";
import assert from "node:assert/strict";

import { gstinCheckChar, isValidGstin, normaliseGstin } from "../gstin";

/* Built with the check function itself, then cross-checked against GSTN's
   published example (27AAPFU0939F1ZV). No real business's registration. */
const withCheck = (first14: string) => first14 + gstinCheckChar(first14);

test("GSTIN: GSTN's published example passes", () => {
  assert.equal(isValidGstin("27AAPFU0939F1ZV"), true);
});

test("GSTIN: one wrong character fails the check digit", () => {
  assert.equal(isValidGstin("27AAPFU0939F1ZW"), false);
  assert.equal(isValidGstin("27AAPFU0938F1ZV"), false);
});

test("GSTIN: spacing and case are forgiven, shape is not", () => {
  const g = withCheck("01ABCDE1234F1Z");
  assert.equal(isValidGstin(g.toLowerCase().replace(/(.{5})/g, "$1 ")), true);
  assert.equal(normaliseGstin(" 01abcde1234f1z" + g[14]), g);
  assert.equal(isValidGstin("01ABCDE1234F1"), false);
  assert.equal(isValidGstin(withCheck("00ABCDE1234F1Z")), false, "state 00 does not exist");
  assert.equal(isValidGstin(withCheck("01ABCDE1234F1Y")), false, "14th character is always Z");
});
