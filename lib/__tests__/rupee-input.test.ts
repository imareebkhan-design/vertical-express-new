import assert from "node:assert/strict";
import test from "node:test";
import { parseRupeeInput } from "@/lib/money";

/**
 * Parsing a rupee amount a person typed.
 *
 * This is the boundary between a text field and a money column, and it is where
 * the obvious implementation — `Math.round(Number(input) * 100)` — goes wrong
 * quietly rather than loudly. Every case below is one of those.
 */

test("a plain amount converts exactly", () => {
  assert.equal(parseRupeeInput("100"), 10_000);
  assert.equal(parseRupeeInput("1234.5"), 123_450);
  assert.equal(parseRupeeInput("0.99"), 99);
  assert.equal(parseRupeeInput("1234.56"), 123_456);
});

test("no float drift, by construction", () => {
  /* 19.99 * 100 is 1998.9999999999998 in IEEE 754. Rounding rescues that one,
     but the paise are assembled from digits here so there is nothing to
     rescue. */
  assert.equal(parseRupeeInput("19.99"), 1999);
  assert.equal(parseRupeeInput("0.07"), 7);
  assert.equal(parseRupeeInput("8.11"), 811);
});

test("an empty field is not free", () => {
  /* Number("") is 0. A blank minimum-order field becoming "₹0 minimum" is a
     coupon that applies to everything. */
  assert.equal(parseRupeeInput(""), null);
  assert.equal(parseRupeeInput("   "), null);
});

test("junk is refused rather than passed through as NaN", () => {
  for (const bad of ["abc", "12abc", "₹100", "-50", "1.2.3", "--5", "+10"]) {
    assert.equal(parseRupeeInput(bad), null, `expected ${JSON.stringify(bad)} to be refused`);
  }
});

test("exponent notation is refused", () => {
  /* Number("1e3") is 1000. A stray "e" turning ten rupees into a thousand is
     the kind of typo nobody reviews. */
  assert.equal(parseRupeeInput("1e3"), null);
  assert.equal(parseRupeeInput("1E3"), null);
  assert.equal(parseRupeeInput("Infinity"), null);
  assert.equal(parseRupeeInput("NaN"), null);
});

test("more than two decimals is refused, never rounded", () => {
  /* Picking one of the two nearby answers on the person's behalf is how a
     wrong price ships. */
  assert.equal(parseRupeeInput("10.999"), null);
  assert.equal(parseRupeeInput("0.001"), null);
});

test("thousands separators are accepted the way people type them", () => {
  assert.equal(parseRupeeInput("1,000"), 100_000);
  assert.equal(parseRupeeInput("1,23,456.50"), 12_345_650);
});

test("the result is always a whole number of paise", () => {
  for (const s of ["1", "1.1", "1.01", "999999.99", "1,000.05"]) {
    const v = parseRupeeInput(s);
    assert.ok(v !== null && Number.isInteger(v), `${s} produced a non-integer`);
  }
});
