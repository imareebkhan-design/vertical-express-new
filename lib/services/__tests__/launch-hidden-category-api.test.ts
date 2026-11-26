import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { handleGetCategory, handleGetProduct, handleListCategories, handleListProducts } from "@/lib/api/v1";
import { getProductBySlug, listProducts } from "../catalog";
import { applyLaunchChange } from "../admin/launch-control";

/**
 * End to end through Launch Control: a category hidden by a switch batch
 * disappears from the storefront services AND from every /api/v1 endpoint the
 * app uses — categories list, category landing, product list, product page —
 * and comes back exactly on undo. The product itself is never written.
 */

const tag = randomUUID().slice(0, 8);
const slug = `lh-${tag}`;
const productSlug = `${slug}-p`;
const ACTOR = { id: null, email: "ops@example.test" };
const ids = { category: "", brand: "", warehouse: "", product: "" };
const NOW = new Date();

before(async () => {
  ids.category = (await db.category.create({ data: { slug, name: `LH ${tag}` } })).id;
  ids.brand = (await db.brand.create({ data: { slug, name: `LH ${tag}` } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `LH ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  const p = await db.product.create({ data: {
    slug: productSlug, title: `LH ${tag} anchor`, status: "published", brandId: ids.brand, categoryId: ids.category,
    identityConfirmed: true, identityApprovedAt: NOW, identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic fixture",
    images: { create: { url: `https://example.test/${slug}.webp`, alt: "lh", isPrimary: true, licence: "manufacturer-official-dealer-use",
      sha256: "8".repeat(64), sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT",
      approvedAt: NOW, approvedBy: "test-reviewer", approvalReason: "Synthetic fixture" } },
  } });
  ids.product = p.id;
  const v = await db.productVariant.create({ data: { productId: p.id, sku: `LH-${tag}`, name: "Unit", pricePaise: 9900, compareAtPaise: 9900, isDefault: true } });
  await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouse, qtyOnHand: 4 } });
  await db.product.update({ where: { id: p.id }, data: { commercialReview: { approvedBy: "test-reviewer", reason: "Synthetic fixture" } } });
});

after(async () => {
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: ids.category }, { entityType: "launch_batch", after: { path: ["categories", "0", "slug"], equals: slug } }] } });
  await db.inventory.deleteMany({ where: { warehouseId: ids.warehouse } });
  await db.productImage.deleteMany({ where: { productId: ids.product } });
  await db.productVariant.deleteMany({ where: { productId: ids.product } });
  await db.product.delete({ where: { id: ids.product } });
  await db.warehouse.delete({ where: { id: ids.warehouse } });
  await db.brand.delete({ where: { id: ids.brand } });
  await db.category.delete({ where: { id: ids.category } });
});

const get = async (handler: Promise<Response>) => {
  const res = await handler;
  return { status: res.status, body: await res.json() as { data?: unknown } };
};

async function everywhere() {
  const cats = await get(handleListCategories(new Request("http://localhost/api/v1/categories")));
  const landing = await get(handleGetCategory(new Request(`http://localhost/api/v1/categories/${slug}`), slug));
  const list = await get(handleListProducts(new Request(`http://localhost/api/v1/products?category=${slug}`)));
  const pdp = await get(handleGetProduct(new Request(`http://localhost/api/v1/products/${productSlug}`), productSlug));
  return {
    apiCategories: ((cats.body.data ?? []) as { slug: string }[]).some((c) => c.slug === slug),
    apiLanding: landing.status,
    apiProducts: ((list.body.data as { items?: { slug: string }[] })?.items ?? []).some((i) => i.slug === productSlug),
    apiProduct: pdp.status,
    webProduct: (await getProductBySlug(productSlug)) !== null,
    webListing: (await listProducts({ categorySlug: slug })).items.some((i) => i.slug === productSlug),
  };
}

test("hidden through Launch Control: gone from the web and from every app endpoint; undo brings it back; the product is never written", async () => {
  const productBefore = await db.product.findUniqueOrThrow({ where: { id: ids.product }, select: { status: true, commercialReview: true, updatedAt: true } });
  assert.deepEqual(await everywhere(), { apiCategories: true, apiLanding: 200, apiProducts: true, apiProduct: 200, webProduct: true, webListing: true });

  const hide = await applyLaunchChange({ categories: [{ slug, isActive: false, expected: true }] }, null, ACTOR);
  assert.equal(hide.ok, true);
  assert.deepEqual(await everywhere(), { apiCategories: false, apiLanding: 404, apiProducts: false, apiProduct: 404, webProduct: false, webListing: false });

  const show = await applyLaunchChange({ categories: [{ slug, isActive: true, expected: false }] }, null, ACTOR, hide.ok ? hide.batchId ?? undefined : undefined);
  assert.equal(show.ok, true);
  assert.deepEqual(await everywhere(), { apiCategories: true, apiLanding: 200, apiProducts: true, apiProduct: 200, webProduct: true, webListing: true });
  assert.deepEqual(await db.product.findUniqueOrThrow({ where: { id: ids.product }, select: { status: true, commercialReview: true, updatedAt: true } }), productBefore);
});
