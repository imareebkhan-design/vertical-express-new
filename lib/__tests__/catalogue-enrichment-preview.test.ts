import assert from "node:assert/strict";
import test from "node:test";
import { previewEnrichment, type EnrichmentContext } from "../catalogue-enrichment-preview";

// Synthetic values only; these fixtures are not catalog data or tax guidance.
const context = (): EnrichmentContext => ({
  products: [{ slug: "fixture-tool", category: "fixture-category", status: "draft", existingSkus: [] }],
  warehouses: [{ id: "fixture-warehouse", isActive: true }],
  existingSkus: [], categoryTaxes: { "fixture-category": { ratePct: 18, hsn: "1234" } },
});
const row = () => ({
  slug: "fixture-tool", sku: "FIXTURE-1", model: "Test model", pack: "Test pack", unitLabel: "per test pack",
  priceRupees: "123.45", priceSource: "test-only supplier quote", approvedBy: "test-only approval",
  gstRatePct: 18, hsn: "1234", stock: [{ warehouseId: "fixture-warehouse", qtyOnHand: 0 }],
});
const run = (r: unknown, c: unknown = context()) => previewEnrichment({ rows: [r] }, c);

test("exact paise and explicit zero stock survive without mutating inputs", () => {
  const r = row(), c = context();
  const before = JSON.stringify({ r, c });
  const result = run(r, c);
  assert.equal(result.readyForDatabaseReview, true);
  assert.equal(result.candidates[0].pricePaise, 12345);
  assert.equal(result.databaseWrites, 0);
  assert.equal(JSON.stringify({ r, c }), before);
});
test("blank/null stock is not interpreted as zero", () => {
  for (const value of [null, "", -1, 1.2, 2_147_483_648]) {
    assert.equal(run({ ...row(), stock: [{ warehouseId: "fixture-warehouse", qtyOnHand: value }] }).readyForDatabaseReview, false);
  }
});
test("unconfirmed or malformed prices never become candidates", () => {
  for (const value of ["", "0", "1e3", "12.345", "1,2", "21474836.48", null]) {
    const result = run({ ...row(), priceRupees: value });
    assert.equal(result.readyForDatabaseReview, false);
    assert.deepEqual(result.candidates, []);
  }
});
test("missing tax mapping and approved tax mismatch are blocked", () => {
  const c = context(); c.categoryTaxes = {};
  assert.match(run(row(), c).issues[0].message, /no explicit tax/);
  assert.equal(run({ ...row(), hsn: "9999" }).readyForDatabaseReview, false);
});
test("duplicate input and existing SKUs block the whole batch", () => {
  assert.deepEqual(previewEnrichment({ rows: [row(), row()] }, context()).candidates, []);
  const c = context(); c.existingSkus = [row().sku];
  assert.equal(run(row(), c).readyForDatabaseReview, false);
});
test("unknown, inactive and duplicate warehouses are rejected", () => {
  assert.equal(run({ ...row(), stock: [{ warehouseId: "unknown", qtyOnHand: 1 }] }).readyForDatabaseReview, false);
  const c = context(); c.warehouses[0].isActive = false;
  assert.equal(run(row(), c).readyForDatabaseReview, false);
  assert.equal(run({ ...row(), stock: [...row().stock, ...row().stock] }).readyForDatabaseReview, false);
});
test("published, unknown and already-enriched products are rejected", () => {
  const c = context(); c.products[0].status = "published";
  assert.equal(run(row(), c).readyForDatabaseReview, false);
  assert.equal(run({ ...row(), slug: "unknown" }).readyForDatabaseReview, false);
  c.products[0].status = "draft"; c.products[0].existingSkus = ["OTHER"];
  assert.equal(run(row(), c).readyForDatabaseReview, false);
});
test("malformed input, duplicate context identities and unknown fields fail closed", () => {
  for (const input of [null, {}, { rows: [] }, { rows: [row()], apply: true }]) {
    assert.equal(previewEnrichment(input, context()).readyForDatabaseReview, false);
  }
  const c = context(); c.products.push(c.products[0]);
  assert.equal(run(row(), c).readyForDatabaseReview, false);
  assert.equal(run({ ...row(), status: "published" }).readyForDatabaseReview, false);
});
test("missing pack, unit, identity or approval is reported", () => {
  for (const field of ["pack", "model", "unitLabel", "sku", "approvedBy", "priceSource"]) {
    assert.equal(run({ ...row(), [field]: "" }).readyForDatabaseReview, false);
  }
});
