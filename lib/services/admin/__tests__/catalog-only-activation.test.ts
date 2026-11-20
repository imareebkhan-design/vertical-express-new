import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { applyCatalogOnly, planCatalogOnly } from "../catalog-only-activation";

/**
 * Catalog-only activation: a reviewed list of draft slugs becomes visible,
 * not purchasable. What must hold:
 *  - only drafts with an approved exact primary photo change;
 *  - any conflict (missing slug, no approved photo, archived) blocks everything;
 *  - inactive brands/categories block activation and are never changed;
 *  - published products are never demoted; a re-run changes nothing;
 *  - every change is audited.
 */
const tag = randomUUID().slice(0, 8);
const s = (x: string) => `coa-${tag}-${x}`;
const ids: Record<string, string> = {};

async function mk(x: string, status: "draft" | "published" | "archived", photo: boolean, brand = "brandOff", category = "catOff") {
  const p = await db.product.create({ data: { slug: s(x), title: `COA ${tag} ${x}`, status, brandId: ids[brand], categoryId: ids[category],
    identityConfirmed: true, identityApprovedAt: new Date(), identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic identity fixture" } });
  if (photo) {
    await db.productImage.create({ data: { productId: p.id, url: `https://example.test/${x}.webp`, alt: x, isPrimary: true, licence: "manufacturer-official-dealer-use", sha256: createSha(x),
      sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT", approvedAt: new Date(), approvedBy: "test-reviewer", approvalReason: "Synthetic photo fixture" } });
  }
  return p.id;
}
const createSha = (x: string) => (x + "0".repeat(64)).replace(/[^0-9a-f]/g, "0").slice(0, 64);
const selected = (...names: string[]) => names.map(x => ({ slug: s(x), imageSha256: createSha(x) }));

before(async () => {
  ids.brandOff = (await db.brand.create({ data: { slug: `coa-b-off-${tag}`, name: `COA Off ${tag}`, isActive: true } })).id;
  ids.brandUnrelated = (await db.brand.create({ data: { slug: `coa-b-unrel-${tag}`, name: `COA Unrel ${tag}`, isActive: false } })).id;
  ids.catOff = (await db.category.create({ data: { slug: `coa-c-off-${tag}`, name: `COA Cat Off ${tag}`, isActive: true } })).id;
  ids.catUnrelated = (await db.category.create({ data: { slug: `coa-c-unrel-${tag}`, name: `COA Cat Unrel ${tag}`, isActive: false } })).id;
  await mk("a", "draft", true);
  await mk("b", "draft", true);
  await mk("nophoto", "draft", false);
  await mk("sold", "published", true);
  await mk("old", "archived", true);
  await mk("bystander", "draft", true, "brandUnrelated", "catUnrelated");
});

after(async () => {
  const products = await db.product.findMany({ where: { slug: { startsWith: `coa-${tag}-` } }, select: { id: true } });
  const productIds = products.map((p) => p.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: [...productIds, ...Object.values(ids)] } } });
  await db.productImage.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.brand.deleteMany({ where: { id: { in: [ids.brandOff, ids.brandUnrelated] } } });
  await db.category.deleteMany({ where: { id: { in: [ids.catOff, ids.catUnrelated] } } });
});

test("a conflict blocks the whole apply and writes nothing", async () => {
  await assert.rejects(applyCatalogOnly(selected("a", "nophoto", "old", "missing"), { batch: "t" }), /3 conflict/);
  const a = await db.product.findUniqueOrThrow({ where: { slug: s("a") } });
  assert.equal(a.status, "draft");
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: ids.brandOff } })).isActive, true);
});

test("plan names exactly the changes and skips published without activating taxonomy", async () => {
  const plan = await planCatalogOnly(selected("a", "b", "sold"));
  assert.deepEqual(plan.change.map((c) => c.slug).sort(), [s("a"), s("b")]);
  assert.deepEqual(plan.skip, [s("sold")]);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.activateBrands, []);
  assert.deepEqual(plan.activateCategories, []);
});

test("apply makes approved drafts catalog-only and audits only those changes", async () => {
  await applyCatalogOnly(selected("a", "b", "sold"), { batch: "t", batchSha256: "x" });
  const rows = await db.product.findMany({ where: { slug: { in: [s("a"), s("b"), s("sold"), s("bystander")] } } });
  const status = Object.fromEntries(rows.map((r) => [r.slug, r.status]));
  assert.equal(status[s("a")], "catalog_only");
  assert.equal(status[s("b")], "catalog_only");
  assert.equal(status[s("sold")], "published", "never demoted");
  assert.equal(status[s("bystander")], "draft");
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: ids.brandOff } })).isActive, true);
  assert.equal((await db.category.findUniqueOrThrow({ where: { id: ids.catOff } })).isActive, true);
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: ids.brandUnrelated } })).isActive, false, "unrelated brand untouched");
  assert.equal((await db.category.findUniqueOrThrow({ where: { id: ids.catUnrelated } })).isActive, false, "unrelated category untouched");
  const audits = await db.auditLog.count({ where: { action: "catalogue.product_catalog_only", entityId: { in: rows.map((r) => r.id) } } });
  assert.equal(audits, 2);
});

test("a re-run is a no-op", async () => {
  const plan = await applyCatalogOnly(selected("a", "b"), { batch: "t" });
  assert.equal(plan.change.length, 0);
  assert.deepEqual(plan.reuse.sort(), [s("a"), s("b")]);
});

test("a reuse-only batch is refused after image approval is revoked", async () => {
  const p = await db.product.findUniqueOrThrow({ where: { slug: s("a") } });
  await db.productImage.updateMany({ where: { productId: p.id }, data: { identityApproved: false, approvalStatus: "REVIEW_REQUIRED" } });
  try {
    await assert.rejects(applyCatalogOnly(selected("a", "b"), { batch: "revoked" }), /1 conflict/);
    assert.equal(await db.auditLog.count({ where: { action: "catalogue.product_catalog_only", entityId: p.id } }), 1);
  } finally {
    await db.productImage.updateMany({ where: { productId: p.id }, data: { identityApproved: true, approvalStatus: "APPROVED_EXACT" } });
  }
});

test("an inactive brand or category blocks reuse and is not reactivated", async () => {
  await db.brand.update({ where: { id: ids.brandOff }, data: { isActive: false } });
  try {
    await assert.rejects(applyCatalogOnly(selected("a"), { batch: "inactive-brand" }), /1 conflict/);
    assert.equal((await db.brand.findUniqueOrThrow({ where: { id: ids.brandOff } })).isActive, false);
  } finally { await db.brand.update({ where: { id: ids.brandOff }, data: { isActive: true } }); }
  await db.category.update({ where: { id: ids.catOff }, data: { isActive: false } });
  try {
    await assert.rejects(applyCatalogOnly(selected("a"), { batch: "inactive-category" }), /1 conflict/);
    assert.equal((await db.category.findUniqueOrThrow({ where: { id: ids.catOff } })).isActive, false);
  } finally { await db.category.update({ where: { id: ids.catOff }, data: { isActive: true } }); }
});

test("even an approved replacement cannot reuse a review for different image bytes", async () => {
  await assert.rejects(applyCatalogOnly([{ slug: s("a"), imageSha256: "f".repeat(64) }], { batch: "wrong-image" }), /1 conflict/);
});

test("malformed or duplicate selection is refused before activation", async () => {
  await assert.rejects(applyCatalogOnly([{ slug: s("a"), imageSha256: "not-a-checksum" }], { batch: "invalid" }), /checksum/);
  await assert.rejects(applyCatalogOnly(selected("a", "a"), { batch: "duplicate" }), /Duplicate/);
});
