import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { adminListProducts } from "../manage";

/**
 * The admin product list can find any product, not just the 30 most recently
 * edited.
 *
 * The page called `adminListProducts()` with no arguments and had no paging, so
 * in a catalogue of hundreds of drafts everything past the first 30 was
 * unreachable from the console. These tests use their own products under a
 * unique tag, and every search is narrowed by that tag or its brand, so rows
 * other test files leave behind cannot change the answers.
 */
const TAG = `ZZZPL${Date.now() % 1_000_000}`;
const ids = { brandA: "", brandB: "", catA: "", catB: "" };
const products: string[] = [];

async function product(title: string, opts: { brand: string; category: string; status: "draft" | "published" | "catalog_only" | "archived"; sku: string }) {
  const p = await db.product.create({
    data: {
      title: `${TAG} ${title}`, slug: `${TAG.toLowerCase()}-${opts.sku.toLowerCase()}`,
      brandId: opts.brand, categoryId: opts.category, status: opts.status,
      variants: { create: [{ sku: `${TAG}-${opts.sku}`, name: "Unit", pricePaise: 1000, isDefault: true }] },
    },
  });
  products.push(p.id);
  return p;
}

before(async () => {
  ids.brandA = (await db.brand.create({ data: { name: `${TAG} Acme Cement`, slug: `${TAG.toLowerCase()}-acme` } })).id;
  ids.brandB = (await db.brand.create({ data: { name: `${TAG} Birla Wire`, slug: `${TAG.toLowerCase()}-birla` } })).id;
  ids.catA = (await db.category.create({ data: { name: `${TAG} Cement`, slug: `${TAG.toLowerCase()}-cement` } })).id;
  ids.catB = (await db.category.create({ data: { name: `${TAG} Wire`, slug: `${TAG.toLowerCase()}-wire` } })).id;
  await product("OPC 53 Grade 50 kg", { brand: ids.brandA, category: ids.catA, status: "draft", sku: "OPC53" });
  await product("PPC 50 kg", { brand: ids.brandA, category: ids.catA, status: "published", sku: "PPC50" });
  await product("FR Wire 1.5 sq mm", { brand: ids.brandB, category: ids.catB, status: "draft", sku: "FRW15" });
  await product("FR Wire 2.5 sq mm", { brand: ids.brandB, category: ids.catB, status: "archived", sku: "FRW25" });
  for (let i = 0; i < 5; i++) await product(`Paging item ${i}`, { brand: ids.brandB, category: ids.catB, status: "catalog_only", sku: `PG${i}` });
});

after(async () => {
  await db.productVariant.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.category.deleteMany({ where: { id: { in: [ids.catA, ids.catB] } } });
  await db.brand.deleteMany({ where: { id: { in: [ids.brandA, ids.brandB] } } });
});

const titles = (r: Awaited<ReturnType<typeof adminListProducts>>) => r.products.map((p) => p.title.replace(`${TAG} `, "")).sort();

test("searching by SKU finds the product, case-insensitively", async () => {
  const r = await adminListProducts(1, 30, { q: `${TAG}-opc53`.toLowerCase() });
  assert.deepEqual(titles(r), ["OPC 53 Grade 50 kg"]);
  assert.equal(r.total, 1);
});

test("searching by title finds every match and nothing else", async () => {
  const r = await adminListProducts(1, 30, { q: `${TAG} fr wire` });
  assert.deepEqual(titles(r), ["FR Wire 1.5 sq mm", "FR Wire 2.5 sq mm"]);
});

test("searching by brand name finds that brand's products", async () => {
  const r = await adminListProducts(1, 30, { q: `${TAG} acme` });
  assert.deepEqual(titles(r), ["OPC 53 Grade 50 kg", "PPC 50 kg"]);
});

test("status, brand and category filters narrow, and combine", async () => {
  assert.deepEqual(titles(await adminListProducts(1, 30, { brandId: ids.brandA, status: "draft" })), ["OPC 53 Grade 50 kg"]);
  assert.deepEqual(titles(await adminListProducts(1, 30, { categoryId: ids.catB, status: "archived" })), ["FR Wire 2.5 sq mm"]);
  assert.deepEqual(titles(await adminListProducts(1, 30, { categoryId: ids.catA, brandId: ids.brandB })), [], "no product is in both");
});

test("every product is reachable: later pages return the rest, without overlap", async () => {
  const filters = { brandId: ids.brandB };
  const first = await adminListProducts(1, 3, filters);
  const second = await adminListProducts(2, 3, filters);
  const third = await adminListProducts(3, 3, filters);
  assert.equal(first.total, 7);
  const seen = [...first.products, ...second.products, ...third.products].map((p) => p.id);
  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7, "no product appears on two pages");
});

test("status counts follow the other filters, so each status tab shows what it opens", async () => {
  const r = await adminListProducts(1, 30, { brandId: ids.brandB, status: "draft" });
  assert.deepEqual(r.statusCounts, { draft: 1, catalog_only: 5, published: 0, archived: 1 });
  assert.equal(r.unfilteredTotal >= 9, true);
});

test("a page past the end shows the last page, never an empty list with an impossible range", async () => {
  const filters = { brandId: ids.brandB };
  const r = await adminListProducts(99, 3, filters);
  assert.equal(r.total, 7);
  assert.equal(r.page, 3, "clamped to the last page");
  assert.equal(r.products.length, 1, "the last page's one product");
  const last = await adminListProducts(3, 3, filters);
  assert.deepEqual(r.products.map((p) => p.id), last.products.map((p) => p.id));
});

test("a page past the end of an empty result is page 1 with nothing on it", async () => {
  const r = await adminListProducts(5, 3, { q: `${TAG} no such product anywhere` });
  assert.equal(r.total, 0);
  assert.equal(r.page, 1);
  assert.equal(r.products.length, 0);
});

test("a nonsense page from a direct caller is treated as page 1, not passed to the database", async () => {
  for (const page of [0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = await adminListProducts(page, 3, { brandId: ids.brandB });
    assert.equal(r.page, 1, `page=${page}`);
    assert.equal(r.products.length, 3);
  }
});
