import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { publicProductWhere } from "@/lib/catalog-policy";
import { addVariant, saveProductDetails, setDefaultVariant, setVariantActive } from "@/lib/services/admin/product-details";
import { createApprovedCatalogueFixture } from "@/test-support/catalogue-fixtures";

/**
 * Details and variants from the console. The rule under test is that the
 * database's approval triggers decide what an edit costs, and the service
 * reports it truthfully: identity edits take a product out of the shop;
 * copy edits do not; any change to the offer clears the commercial review.
 */

const ACTOR = { id: null, email: "ops@example.test" };
const cleanups: (() => Promise<void>)[] = [];
const extraVariants: string[] = [];

after(async () => {
  await db.inventory.deleteMany({ where: { variantId: { in: extraVariants } } });
  await db.productVariant.deleteMany({ where: { id: { in: extraVariants } } });
  for (const c of cleanups.reverse()) await c();
});

async function fixture() {
  const f = await createApprovedCatalogueFixture();
  cleanups.push(async () => {
    await db.auditLog.deleteMany({ where: { entityId: f.product.id } });
    await f.cleanup();
  });
  return f;
}
const isPublic = (id: string) => db.product.count({ where: { AND: [publicProductWhere(), { id }] } });

test("editing only the description keeps the product approved and in the shop", async () => {
  const f = await fixture();
  const r = await saveProductDetails(f.product.id, { description: "Sold by the bag.", unitLabel: "per piece", specs: [] }, ACTOR);
  assert.deepEqual(r, { ok: true, identityReset: false, commercialReset: false });
  assert.equal(await isPublic(f.product.id), 1);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).description, "Sold by the bag.");
});

test("changing the specifications sends the product back for approval, and says so", async () => {
  const f = await fixture();
  const r = await saveProductDetails(
    f.product.id,
    { description: "", unitLabel: "per piece", specs: [{ label: "Weight", value: "50 kg" }, { label: "Empty", value: "" }] },
    ACTOR
  );
  assert.deepEqual(r, { ok: true, identityReset: true, commercialReset: true });
  assert.equal(await isPublic(f.product.id), 0, "an unapproved identity is not shown");
  const row = await db.product.findUniqueOrThrow({ where: { id: f.product.id } });
  assert.deepEqual(row.specs, [{ label: "Weight", value: "50 kg" }], "stored in the shape the storefront reads; blank rows dropped");
  const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: f.product.id, action: "catalogue.product_details_edited" } });
  assert.equal((audit.after as { identityReset: boolean }).identityReset, true);
});

test("a unit label is required", async () => {
  const f = await fixture();
  assert.equal((await saveProductDetails(f.product.id, { description: "", unitLabel: "  ", specs: [] }, ACTOR)).ok, false);
});

test("adding a variant clears the commercial review; the existing default keeps leading; a zero stock row is made", async () => {
  const f = await fixture();
  const warehouseId = (await db.inventory.findFirstOrThrow({ where: { variantId: f.variant.id } })).warehouseId;
  const sku = `ZZ-${randomUUID().slice(0, 8)}`;
  const r = await addVariant(f.product.id, { name: "Pack of 10", sku, pricePaise: 90000, compareAtPaise: null, warehouseId }, ACTOR);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  extraVariants.push(r.variantId);
  const v = await db.productVariant.findUniqueOrThrow({ where: { id: r.variantId }, include: { inventory: true } });
  assert.equal(v.isDefault, false);
  assert.deepEqual(v.inventory.map((i) => i.qtyOnHand), [0]);
  assert.equal(await db.stockMovement.count({ where: { variantId: r.variantId } }), 0, "no ledger row for stock that never arrived");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).commercialReview, null);
  assert.deepEqual(await addVariant(f.product.id, { name: "Dup", sku, pricePaise: 1000, compareAtPaise: null, warehouseId: null }, ACTOR), {
    ok: false,
    code: "SKU_TAKEN",
  });
});

test("an MRP below the selling price is refused", async () => {
  const f = await fixture();
  const r = await addVariant(f.product.id, { name: "Bad", sku: `ZZ-${randomUUID().slice(0, 8)}`, pricePaise: 5000, compareAtPaise: 4000, warehouseId: null }, ACTOR);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "INVALID");
});

test("the default variant cannot be retired until another leads; exactly one default afterwards", async () => {
  const f = await fixture();
  assert.deepEqual(await setVariantActive(f.variant.id, false, ACTOR), { ok: false, code: "IS_DEFAULT" });
  const r = await addVariant(f.product.id, { name: "Bag", sku: `ZZ-${randomUUID().slice(0, 8)}`, pricePaise: 20000, compareAtPaise: null, warehouseId: null }, ACTOR);
  if (!r.ok) throw new Error("setup");
  extraVariants.push(r.variantId);
  assert.equal((await setDefaultVariant(r.variantId, ACTOR)).ok, true);
  assert.equal(await db.productVariant.count({ where: { productId: f.product.id, isDefault: true } }), 1);
  assert.equal((await setVariantActive(f.variant.id, false, ACTOR)).ok, true);
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: f.variant.id } })).isActive, false);
  assert.deepEqual(await setDefaultVariant(f.variant.id, ACTOR), { ok: false, code: "INACTIVE" });
});
