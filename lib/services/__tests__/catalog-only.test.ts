import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { addItem, getCartSummary, resolveWarehouseId } from "../cart";
import { getProductBySlug, listProducts } from "../catalog";
import { getSuggestions } from "../search";
import { catalogOnlyReason, unpublishableReason } from "../admin/publish-guard";

/**
 * Catalog-only products: visible, never purchasable.
 *
 * The 979 approved catalogue products exist with identity and (for 263) an
 * approved exact photo, but no price, variant or stock. `catalog_only` lets the
 * storefront show them without letting any of them be sold. These tests hold
 * both halves of that promise:
 *
 *  - VISIBLE: listings, search, suggestions and the PDP return a catalog-only
 *    product that carries its primary photo, with price/variant null — never 0.
 *  - NOT PURCHASABLE: `addItem` refuses its variant even with stock on the
 *    shelf, and a line already in a cart is dropped from the summary, which is
 *    what checkout builds the order from.
 *
 * The cart refusal is new: before this change `addItem` checked only that the
 * variant was active, so a draft product's variant could be added by a crafted
 * request. The "draft" case below covers that pre-existing hole.
 */
const tag = randomUUID().slice(0, 8);
const USER = randomUUID();
const ids: { categoryId?: string; offCategoryId?: string; brandId?: string; warehouseId?: string } = {};
const slug = (s: string) => `co-${tag}-${s}`;
let catalogVariantId: string;
let draftVariantId: string;
let publishedVariantId: string;

async function product(s: string, status: "draft" | "catalog_only" | "published", opts: { photo?: "exact" | "plain" | null; variantPaise?: number; categoryId?: string } = {}) {
  const p = await db.product.create({
    data: { slug: slug(s), title: `Catalog Only Probe ${tag} ${s}`, brandId: ids.brandId!, categoryId: opts.categoryId ?? ids.categoryId!, status },
  });
  if (opts.photo) {
    await db.productImage.create({
      data: {
        productId: p.id, url: `https://example.test/${s}.webp`, alt: s, isPrimary: true,
        ...(opts.photo === "exact" ? { licence: "manufacturer-official-dealer-use", sha256: "a".repeat(63) + s.length.toString(16).slice(-1), sourceUrl: "https://example.test/src" } : {}),
      },
    });
  }
  let variantId: string | undefined;
  if (opts.variantPaise != null) {
    const v = await db.productVariant.create({
      data: { productId: p.id, sku: `CO-${tag}-${s}`, name: "Default", pricePaise: opts.variantPaise, isDefault: true },
    });
    await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouseId!, qtyOnHand: 50 } });
    variantId = v.id;
  }
  return { id: p.id, variantId };
}

before(async () => {
  ids.categoryId = (await db.category.create({ data: { slug: `co-cat-${tag}`, name: `CO Category ${tag}` } })).id;
  ids.offCategoryId = (await db.category.create({ data: { slug: `co-off-${tag}`, name: `CO Off ${tag}`, isActive: false } })).id;
  ids.brandId = (await db.brand.create({ data: { slug: `co-brand-${tag}`, name: `CO Brand ${tag}` } })).id;
  await db.user.create({ data: { id: USER, phone: `+9198${String(Date.now()).slice(-8)}`, email: `co_${tag}@example.com` } });
  // Stock the warehouse the cart will actually use, so a refusal is about status, not stock.
  ids.warehouseId = await resolveWarehouseId(USER);

  await product("visible", "catalog_only", { photo: "exact" });
  await product("nophoto", "catalog_only", { photo: null });
  // A catalog-only product that already has a priced, stocked variant: still not for sale.
  catalogVariantId = (await product("withvariant", "catalog_only", { photo: "exact", variantPaise: 45000 })).variantId!;
  draftVariantId = (await product("draft", "draft", { photo: "exact", variantPaise: 45000 })).variantId!;
  publishedVariantId = (await product("published", "published", { photo: "plain", variantPaise: 39000 })).variantId!;
  await product("plainphoto", "catalog_only", { photo: "plain" });
  await product("offcat", "catalog_only", { photo: "exact", categoryId: ids.offCategoryId });
});

after(async () => {
  const products = await db.product.findMany({ where: { slug: { startsWith: `co-${tag}-` } }, select: { id: true } });
  const productIds = products.map((p) => p.id);
  await db.cartItem.deleteMany({ where: { variant: { productId: { in: productIds } } } });
  await db.cart.deleteMany({ where: { userId: USER } });
  await db.inventory.deleteMany({ where: { variant: { productId: { in: productIds } } } });
  await db.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await db.productImage.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.brand.deleteMany({ where: { id: ids.brandId } });
  await db.category.deleteMany({ where: { id: { in: [ids.categoryId!, ids.offCategoryId!] } } });
  await db.user.deleteMany({ where: { id: USER } });
});

test("listing shows a catalog-only product with its photo, no price, no variant", async () => {
  const { items } = await listProducts({ categorySlug: `co-cat-${tag}`, perPage: 48 });
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const card = bySlug.get(slug("visible"));
  assert.ok(card, "catalog-only product with a primary photo is listed");
  assert.equal(card.purchasable, false);
  assert.equal(card.pricePaise, null);
  assert.equal(card.compareAtPaise, null);
  assert.equal(card.variantId, null);
  assert.equal(card.inStock, false);
  assert.equal(card.imageUrl, "https://example.test/visible.webp");

  const withVariant = bySlug.get(slug("withvariant"));
  assert.ok(withVariant, "listed even though it has a variant");
  assert.equal(withVariant.pricePaise, null, "an existing variant's price is never exposed while catalog-only");
  assert.equal(withVariant.variantId, null);

  assert.equal(bySlug.has(slug("nophoto")), false, "no photo → stays hidden");
  assert.equal(bySlug.has(slug("draft")), false, "draft stays hidden");
  const sold = bySlug.get(slug("published"));
  assert.ok(sold && sold.purchasable && sold.pricePaise === 39000, "published product unchanged");
});

test("a price filter or price sort never surfaces or misorders catalog-only products", async () => {
  const filtered = await listProducts({ categorySlug: `co-cat-${tag}`, minPaise: 0, maxPaise: 10_000_000 });
  assert.deepEqual(filtered.items.map((i) => i.slug), [slug("published")]);

  for (const sort of ["price_asc", "price_desc"] as const) {
    const { items } = await listProducts({ categorySlug: `co-cat-${tag}`, sort });
    assert.equal(items[0]?.slug, slug("published"), `${sort}: priced first`);
    assert.ok(items.slice(1).every((i) => i.pricePaise === null), `${sort}: unpriced last`);
  }
});

test("search and suggestions find catalog-only products and report no price", async () => {
  const { items } = await listProducts({ search: `Catalog Only Probe ${tag}`, perPage: 48 });
  const card = items.find((i) => i.slug === slug("visible"));
  assert.ok(card, "search returns it");
  assert.equal(card.pricePaise, null);
  assert.ok(!items.some((i) => i.slug === slug("nophoto") || i.slug === slug("draft")));

  const suggestions = await getSuggestions(`Catalog Only Probe ${tag}`);
  const s = suggestions.products.find((p) => p.slug === slug("visible"));
  assert.ok(s, "suggested");
  assert.equal(s.pricePaise, null, "never ₹0");
  assert.ok(!suggestions.products.some((p) => p.slug === slug("draft")));
});

test("the PDP returns a catalog-only product as not purchasable with no variants", async () => {
  const detail = await getProductBySlug(slug("withvariant"));
  assert.ok(detail);
  assert.equal(detail.purchasable, false);
  assert.deepEqual(detail.variants, [], "no variant, price or stock reaches the page");
  assert.equal(await getProductBySlug(slug("nophoto")), null);
  assert.equal(await getProductBySlug(slug("draft")), null);
  const sold = await getProductBySlug(slug("published"));
  assert.ok(sold?.purchasable && sold.variants.length === 1);
});

test("addItem refuses a catalog-only product's variant even with stock", async () => {
  await assert.rejects(addItem(USER, null, catalogVariantId, 1), /not for sale/i);
});

test("addItem refuses a draft product's variant (the pre-existing hole)", async () => {
  await assert.rejects(addItem(USER, null, draftVariantId, 1), /not for sale/i);
});

test("a catalog-only line already in a cart never reaches the summary checkout uses", async () => {
  await addItem(USER, null, publishedVariantId, 1);
  const cart = await db.cart.findUniqueOrThrow({ where: { userId: USER } });
  // Simulate a line that predates the guard (or a status change after it was added).
  await db.cartItem.create({ data: { cartId: cart.id, variantId: catalogVariantId, qty: 2 } });
  const summary = await getCartSummary(USER, null);
  assert.deepEqual(summary.lines.map((l) => l.variantId), [publishedVariantId]);
});

test("catalogOnlyReason demands an exact provenance photo and active brand/category", async () => {
  const get = async (s: string) => (await db.product.findUniqueOrThrow({ where: { slug: slug(s) }, select: { id: true } })).id;
  assert.equal(await catalogOnlyReason(db, await get("visible")), null);
  assert.match((await catalogOnlyReason(db, await get("nophoto")))!, /photo/);
  assert.match((await catalogOnlyReason(db, await get("plainphoto")))!, /photo/, "an image without provenance (illustration/placeholder) does not qualify");
  assert.match((await catalogOnlyReason(db, await get("offcat")))!, /category is inactive/);
});

test("catalog-only does not weaken the publish guard", async () => {
  const id = (await db.product.findUniqueOrThrow({ where: { slug: slug("visible") }, select: { id: true } })).id;
  assert.match((await unpublishableReason(db, id))!, /price/);
});
