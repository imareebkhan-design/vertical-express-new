import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { setProductStatus } from "../product-status";
import { setCategoryActive } from "../categories";

/**
 * Status changes and category switches as Launch Control will make them.
 *
 *  - every change of product status leaves exactly one audit row, including
 *    hiding (draft, archived), which used to reach the application log only;
 *  - a no-op leaves none; a refused publish writes nothing at all;
 *  - hiding a category and showing it again restores the product exactly:
 *    status, commercial review, variants and stock untouched.
 */

const tag = randomUUID().slice(0, 8);
const ACTOR = { id: null, email: "ops@example.test" };
const ids = { category: "", brand: "", warehouse: "", product: "", bare: "" };
const NOW = new Date();

before(async () => {
  ids.category = (await db.category.create({ data: { slug: `ps-${tag}`, name: `PS ${tag}` } })).id;
  ids.brand = (await db.brand.create({ data: { slug: `ps-${tag}`, name: `PS ${tag}` } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `PS ${tag}`, city: "Srinagar", pincode: "190001" } })).id;

  // Listed as sellable in this (untaxed) category, so a category switch is observable.
  const p = await db.product.create({ data: {
    slug: `ps-${tag}-listed`, title: `PS ${tag} listed`, status: "published", brandId: ids.brand, categoryId: ids.category,
    unitLabel: "per bag", deliverySpeed: "scheduled",
    identityConfirmed: true, identityApprovedAt: NOW, identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic fixture",
    images: { create: { url: `https://example.test/ps-${tag}.webp`, alt: "ps", isPrimary: true, licence: "manufacturer-official-dealer-use",
      sha256: "d".repeat(64), sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT",
      approvedAt: NOW, approvedBy: "test-reviewer", approvalReason: "Synthetic fixture" } },
  } });
  ids.product = p.id;
  const v = await db.productVariant.create({ data: { productId: p.id, sku: `PS-${tag}`, name: "50 kg", pricePaise: 45000, compareAtPaise: 45000, isDefault: true } });
  await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouse, qtyOnHand: 7 } });
  await db.product.update({ where: { id: p.id }, data: { commercialReview: { approvedBy: "test-reviewer", reason: "Synthetic fixture" } } });

  // A draft with nothing behind it: no variant, no photo, no identity.
  ids.bare = (await db.product.create({ data: {
    slug: `ps-${tag}-bare`, title: `PS ${tag} bare`, status: "draft", brandId: ids.brand, categoryId: ids.category,
  } })).id;
});

after(async () => {
  const products = [ids.product, ids.bare];
  await db.auditLog.deleteMany({ where: { entityId: { in: [...products, ids.category] } } });
  await db.inventory.deleteMany({ where: { warehouseId: ids.warehouse } });
  await db.productImage.deleteMany({ where: { productId: { in: products } } });
  await db.productVariant.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.warehouse.delete({ where: { id: ids.warehouse } });
  await db.brand.delete({ where: { id: ids.brand } });
  await db.category.delete({ where: { id: ids.category } });
});

const audits = (entityId: string) => db.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } });
const listed = async () => (await db.product.count({ where: { id: ids.product, AND: [catalogListingWhere()] } })) === 1;

test("hiding a product as a draft and archiving it are each audited", async () => {
  const start = (await audits(ids.product)).length;
  assert.deepEqual(await setProductStatus(ids.product, "draft", ACTOR), { ok: true, changed: true, slug: `ps-${tag}-listed` });
  assert.deepEqual(await setProductStatus(ids.product, "archived", ACTOR), { ok: true, changed: true, slug: `ps-${tag}-listed` });
  const rows = (await audits(ids.product)).slice(start);
  assert.deepEqual(rows.map((r) => [r.action, r.before, r.after]), [
    ["catalogue.product_status_changed", { status: "published" }, { status: "draft", by: ACTOR.email }],
    ["catalogue.product_status_changed", { status: "draft" }, { status: "archived", by: ACTOR.email }],
  ]);
});

test("a no-op writes no audit row", async () => {
  const start = (await audits(ids.product)).length;
  assert.deepEqual(await setProductStatus(ids.product, "archived", ACTOR), { ok: true, changed: false, slug: `ps-${tag}-listed` });
  assert.equal((await audits(ids.product)).length, start);
});

test("a refused publish writes nothing: status unchanged, no audit row, every reason returned", async () => {
  const start = (await audits(ids.bare)).length;
  const r = await setProductStatus(ids.bare, "published", ACTOR);
  assert.equal(r.ok, false);
  if (r.ok || r.code !== "GATE_REFUSED") throw new Error("expected a gate refusal");
  assert.ok(r.reasons.includes("No active default variant"));
  assert.ok(r.reasons.some((x) => /HSN\/GST/.test(x)), "an untaxed category is a reason, not a fallback");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: ids.bare } })).status, "draft");
  assert.equal((await audits(ids.bare)).length, start);
});

test("an unknown product is NOT_FOUND", async () => {
  assert.deepEqual(await setProductStatus(randomUUID(), "draft", ACTOR), { ok: false, code: "NOT_FOUND" });
});

test("hiding a category and showing it again restores the product exactly", async () => {
  // Put the product back on sale by status alone (the gate is exercised above; this is the
  // category behaviour), then snapshot everything a restore must not disturb.
  await db.product.update({ where: { id: ids.product }, data: { status: "published" } });
  const snapshot = () => db.product.findUniqueOrThrow({
    where: { id: ids.product },
    select: { status: true, commercialReview: true, updatedAt: true,
      variants: { select: { id: true, isActive: true, isDefault: true, pricePaise: true, compareAtPaise: true, updatedAt: true,
        inventory: { select: { qtyOnHand: true, qtyReserved: true } } } } },
  });
  const beforeHide = await snapshot();
  assert.equal(await listed(), true);

  assert.equal(await setCategoryActive(`ps-${tag}`, false, ACTOR), "changed");
  assert.equal(await listed(), false);
  assert.equal(await setCategoryActive(`ps-${tag}`, true, ACTOR), "changed");
  assert.equal(await listed(), true);
  assert.deepEqual(await snapshot(), beforeHide);

  const rows = await audits(ids.category);
  assert.deepEqual(rows.map((r) => [r.action, r.before, r.after]), [
    ["catalogue.category_hidden", { slug: `ps-${tag}`, isActive: true }, { slug: `ps-${tag}`, isActive: false, by: ACTOR.email }],
    ["catalogue.category_shown", { slug: `ps-${tag}`, isActive: false }, { slug: `ps-${tag}`, isActive: true, by: ACTOR.email }],
  ]);
});

test("a category toggle that changes nothing is not audited; a missing category says so", async () => {
  const start = (await audits(ids.category)).length;
  assert.equal(await setCategoryActive(`ps-${tag}`, true, ACTOR), "unchanged");
  assert.equal((await audits(ids.category)).length, start);
  assert.equal(await setCategoryActive(`ps-missing-${tag}`, false, ACTOR), "missing");
});

test("concurrent toggles serialize: exactly one of two identical switches is recorded", async () => {
  const start = (await audits(ids.category)).length;
  const results = await Promise.all([setCategoryActive(`ps-${tag}`, false, ACTOR), setCategoryActive(`ps-${tag}`, false, ACTOR)]);
  assert.deepEqual(results.sort(), ["changed", "unchanged"]);
  assert.equal((await audits(ids.category)).length, start + 1);
  await setCategoryActive(`ps-${tag}`, true, ACTOR);
});
