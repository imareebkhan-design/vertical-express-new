/**
 * Task 6 — attaching prepared product photographs.
 *
 * Against the local test database. All data is created and deleted by this file (`zzz-img-…`).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { applyImageImport, itemProblem, planImageImport, type ImagePlanItem } from "@/lib/services/admin/product-image-import";

const BASE = "https://storage.googleapis.com/ve-test-images";
const P = "zzz-img";
const sha = (c: string) => c.repeat(64);
const item = (slug: string, over: Partial<ImagePlanItem> = {}): ImagePlanItem => ({
  slug,
  url: `${BASE}/products/${slug}/1.webp`,
  alt: "Test product",
  sortOrder: 0,
  isPrimary: true,
  sourceUrl: "https://manufacturer.example/p/1.jpg",
  licence: "manufacturer-official",
  width: 1600,
  height: 1600,
  sha256: sha("a"),
  ...over,
});
let brandId: string, categoryId: string;
const images = (slug: string) => db.productImage.findMany({ where: { product: { slug } }, orderBy: { sortOrder: "asc" } });

async function cleanup() {
  const ps = await db.product.findMany({ where: { slug: { startsWith: P } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: ps.map((p) => p.id) } } });
  await db.product.deleteMany({ where: { id: { in: ps.map((p) => p.id) } } });
}
before(async () => {
  await cleanup();
  brandId = (await db.brand.findFirstOrThrow({ select: { id: true } })).id;
  categoryId = (await db.category.findFirstOrThrow({ select: { id: true } })).id;
  for (const s of ["a", "b", "c"]) {
    await db.product.create({ data: { slug: `${P}-${s}`, title: `Img ${s}`, brandId, categoryId, status: "draft" } });
  }
  /* c already shows a picture from elsewhere (a demo placeholder: no sha256). */
  const c = await db.product.findUniqueOrThrow({ where: { slug: `${P}-c` } });
  await db.productImage.create({ data: { productId: c.id, url: "/placeholder-product.webp", alt: "x", isPrimary: true } });
});
after(cleanup);

test("field rules", () => {
  assert.equal(itemProblem(item("x"), BASE), null);
  assert.match(itemProblem(item("x", { url: "http://storage.googleapis.com/ve-test-images/a.webp" }), BASE)!, /https/);
  assert.match(itemProblem(item("x", { url: "https://evil.example/a.webp" }), BASE)!, /image host/);
  assert.match(itemProblem(item("x", { url: `${BASE}-other/a.webp` }), BASE)!, /image host/, "a look-alike bucket prefix is not the host");
  assert.match(itemProblem(item("x", { licence: " " }), BASE)!, /licence/);
  assert.match(itemProblem(item("x", { width: 0 }), BASE)!, /width/);
  assert.match(itemProblem(item("x", { sha256: "ABC" }), BASE)!, /sha256/);
  assert.match(itemProblem(item("x", { alt: "" }), BASE)!, /alt/);
});

test("attaches, audits, leaves the product a draft; a re-run attaches nothing", async () => {
  const items = [item(`${P}-a`), item(`${P}-a`, { url: `${BASE}/products/${P}-a/2.webp`, isPrimary: false, sortOrder: 1, sha256: sha("b") })];
  const first = await applyImageImport(items, BASE, { id: null });
  assert.equal(first.ok, true);
  const imgs = await images(`${P}-a`);
  assert.equal(imgs.length, 2);
  assert.deepEqual(imgs.map((i) => [i.isPrimary, i.licence, i.width, i.sha256]), [[true, "manufacturer-official", 1600, sha("a")], [false, "manufacturer-official", 1600, sha("b")]]);
  const product = await db.product.findUniqueOrThrow({ where: { slug: `${P}-a` } });
  assert.equal(product.status, "draft", "attaching a picture never publishes");
  const audits = await db.auditLog.findMany({ where: { entityId: product.id, action: "product.images_attached" } });
  assert.equal(audits.length, 1);

  const again = await applyImageImport(items, BASE, { id: null });
  assert.equal(again.ok, true);
  assert.equal(again.ok && again.attached, 0);
  assert.equal(again.plan.already.length, 2);
  assert.equal((await images(`${P}-a`)).length, 2, "no duplicate pictures");
});

test("an unknown slug, an invalid item or a conflict blocks the whole apply", async () => {
  const unknown = await applyImageImport([item(`${P}-b`), item(`${P}-nope`)], BASE, { id: null });
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.plan.missingProducts, [`${P}-nope`]);
  assert.equal((await images(`${P}-b`)).length, 0, "nothing written for the valid item either");

  const two = await planImageImport([item(`${P}-b`), item(`${P}-b`, { sha256: sha("c"), url: `${BASE}/products/b/2.webp` })], BASE);
  assert.match(two.conflicts[0].reason, /more than one primary/);

  const bad = await applyImageImport([item(`${P}-b`, { licence: "" })], BASE, { id: null });
  assert.equal(bad.ok, false);
  assert.equal(bad.plan.invalid.length, 1);
});

test("a product that already has a primary picture from elsewhere is not overridden", async () => {
  const res = await applyImageImport([item(`${P}-c`)], BASE, { id: null });
  assert.equal(res.ok, false);
  assert.match(res.plan.conflicts[0].reason, /already has a primary image/);
  const imgs = await images(`${P}-c`);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].url, "/placeholder-product.webp");
});
