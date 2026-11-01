import { test } from "node:test";
import assert from "node:assert/strict";
import { discountPercent, struckMrpPaise } from "@/lib/money";

/**
 * Price presentation under the owner's MRP rule: selling at MRP shows no
 * saving; selling below shows the real discount; a missing MRP (historical
 * rows) shows nothing rather than an invented one.
 */
test("selling at MRP shows no struck-through price and no discount", () => {
  assert.equal(struckMrpPaise(49000, 49000), null);
  assert.equal(discountPercent(49000, 49000), null);
});

test("selling below MRP shows the MRP struck through and the actual discount", () => {
  assert.equal(struckMrpPaise(44100, 49000), 49000);
  assert.equal(discountPercent(44100, 49000), 10);
});

test("a missing MRP shows nothing", () => {
  assert.equal(struckMrpPaise(49000, null), null);
  assert.equal(struckMrpPaise(49000, undefined), null);
  assert.equal(discountPercent(49000, null), null);
});
