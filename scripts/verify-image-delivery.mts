/** Read-only rehearsal on a local production restore. Never changes approvals. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { productionImageDeliveries, productImageDeliveryUrl } from "../lib/catalog/image-delivery";

const target = new URL(process.env.DATABASE_URL ?? "http://unset");
if (!["localhost", "127.0.0.1"].includes(target.hostname) || process.env.VE_TEST_DATABASE !== "1") {
  throw new Error("Use an explicitly disposable local production restore (VE_TEST_DATABASE=1)");
}
process.env.VE_DEPLOY_ENV = "production";
process.env.COMMERCE_MODE = "catalogue";
process.env.PRODUCTION_IMAGE_DELIVERY = "1";
const { db } = await import("../lib/db");
const { approvedImageWhere, catalogListingWhere } = await import("../lib/catalog-policy");
const { listProducts, getProductBySlug } = await import("../lib/services/catalog");
const { getSuggestions } = await import("../lib/services/search");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
try {
  const before = await db.productImage.findMany({ orderBy: { id: "asc" } });
  const approved = await db.productImage.findMany({ where: approvedImageWhere() });
  const entries = new Map(productionImageDeliveries.map((i) => [i.id, i]));
  const source = "https://storage.googleapis.com/ve-staging-product-images/";
  const relocating = approved.filter((i) => i.url.startsWith(source));
  assert.ok(relocating.length > 0, "Restore has no source images to exercise");
  for (const image of relocating) {
    const entry = entries.get(image.id);
    assert.ok(entry, `Missing delivery mapping: ${image.id}`);
    assert.equal(entry.from, image.url);
    assert.equal(entry.sha256, image.sha256);
    assert.equal(productImageDeliveryUrl(image), entry.to);
    const response = await fetch(entry.to, { signal: AbortSignal.timeout(30_000) });
    assert.ok(response.ok, `Unavailable pinned destination: ${image.id}`);
    assert.equal(createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex"), image.sha256);
  }
  const products = await db.product.findMany({ where: catalogListingWhere(), include: {
    images: { where: approvedImageWhere(), orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  } });
  async function cards() {
    const collected = new Map<string, string | null>();
    for (let page = 1; ; page++) {
      const result = await listProducts({ page, perPage: 60 });
      for (const item of result.items) collected.set(item.slug, item.imageUrl);
      if (page * result.perPage >= result.total) return collected;
    }
  }
  const deliveredCards = await cards();
  for (const product of products) {
    const detail = await getProductBySlug(product.slug);
    assert.ok(deliveredCards.has(product.slug) && detail, `Visibility lost: ${product.slug}`);
    assert.equal(deliveredCards.get(product.slug), productImageDeliveryUrl(product.images.find((i) => i.isPrimary)));
    assert.deepEqual(detail.images.map((i) => i.url), product.images.map(productImageDeliveryUrl));
  }
  const suggestions = await getSuggestions("XTRA");
  assert.ok(suggestions.products.length > 0);
  assert.ok(suggestions.products.every((p) => p.imageUrl?.startsWith("https://storage.googleapis.com/ve-production-product-images/")));
  process.env.PRODUCTION_IMAGE_DELIVERY = "0";
  const rolledBackCards = await cards();
  for (const product of products) {
    assert.equal(rolledBackCards.get(product.slug), product.images.find((i) => i.isPrimary)?.url ?? null);
  }
  assert.equal(hash(await db.productImage.findMany({ orderBy: { id: "asc" } })), hash(before), "Image rows or approval provenance changed");
  assert.equal(await db.product.count({ where: catalogListingWhere() }), products.length);
  console.log(JSON.stringify({ pinnedBytesVerified: relocating.length, visibleProducts: products.length,
    detailAndCardChecks: products.length, rollbackChecks: products.length, searchChecks: suggestions.products.length,
    imageRowsUnchanged: before.length, databaseWrites: 0 }));
} finally { await db.$disconnect(); }
