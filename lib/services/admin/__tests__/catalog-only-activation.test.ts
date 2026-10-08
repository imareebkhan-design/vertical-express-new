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
 *  - only the inactive brands/categories those products need are activated;
 *  - published products are never demoted; a re-run changes nothing;
 *  - every change is audited.
 */
const tag = randomUUID().slice(0, 8);
const s = (x: string) => `coa-${tag}-${x}`;
const ids: Record<string, string> = {};

async function mk(x: string, status: "draft" | "published" | "archived", photo: boolean, brand = "brandOff", category = "catOff") {
  const p = await db.product.create({ data: { slug: s(x), title: `COA ${tag} ${x}`, status, brandId: ids[brand], categoryId: ids[category] } });
  if (photo) {
    await db.productImage.create({ data: { productId: p.id, url: `https://example.test/${x}.webp`, alt: x, isPrimary: true, licence: "manufacturer-official-dealer-use", sha256: createSha(x) } });
  }
  return p.id;
}
const createSha = (x: string) => (x + "0".repeat(64)).replace(/[^0-9a-f]/g, "0").slice(0, 64);

before(async () => {
  ids.brandOff = (await db.brand.create({ data: { slug: `coa-b-off-${tag}`, name: `COA Off ${tag}`, isActive: false } })).id;
  ids.brandUnrelated = (await db.brand.create({ data: { slug: `coa-b-unrel-${tag}`, name: `COA Unrel ${tag}`, isActive: false } })).id;
  ids.catOff = (await db.category.create({ data: { slug: `coa-c-off-${tag}`, name: `COA Cat Off ${tag}`, isActive: false } })).id;
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
  await assert.rejects(applyCatalogOnly([s("a"), s("nophoto"), s("old"), s("missing")], { batch: "t" }), /3 conflict/);
  const a = await db.product.findUniqueOrThrow({ where: { slug: s("a") } });
  assert.equal(a.status, "draft");
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: ids.brandOff } })).isActive, false);
});

test("plan names exactly the changes, skips published, and needs only the used brand/category", async () => {
  const plan = await planCatalogOnly([s("a"), s("b"), s("sold")]);
  assert.deepEqual(plan.change.map((c) => c.slug).sort(), [s("a"), s("b")]);
  assert.deepEqual(plan.skip, [s("sold")]);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.activateBrands.map((b) => b.id), [ids.brandOff]);
  assert.deepEqual(plan.activateCategories.map((c) => c.id), [ids.catOff]);
});

test("apply makes them catalog-only, activates only what they need, and audits it", async () => {
  await applyCatalogOnly([s("a"), s("b"), s("sold")], { batch: "t", batchSha256: "x" });
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
  const plan = await applyCatalogOnly([s("a"), s("b")], { batch: "t" });
  assert.equal(plan.change.length, 0);
  assert.deepEqual(plan.reuse.sort(), [s("a"), s("b")]);
});
