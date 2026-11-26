import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/prisma/generated/client/client";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { setProductStatus } from "@/lib/services/admin/product-status";
import { setBrandActive } from "@/lib/services/admin/brand-writes";
import { setCategoryActive } from "@/lib/services/admin/categories";
import { getProductBySlug, listCategoryDirectory, listProducts } from "../catalog";
import { getSuggestions } from "../search";
import { addItem, resolveWarehouseId } from "../cart";
import { assertCheckoutCatalogue } from "../checkout-catalogue";

/**
 * Preparing products while their category or brand is hidden (owner, 12 Nov
 * 2026, Launch Control PR-4), and the half that makes it safe: a prepared
 * product reaches NO customer path — listings, search, the product page, the
 * category directory (which /api/v1/categories serves), the cart and checkout —
 * until its brand and category are switched on, and then it appears with no
 * further write.
 */

const tag = randomUUID().slice(0, 8);
const TAXED = "general-hardware-tools";
const ACTOR = { id: null, email: "ops@example.test" };
const ids = { taxed: "", hiddenCat: "", brand: "", warehouse: "", published: "", publishedVariant: "", catalogueOnly: "" };
const slugs = { brand: `hp-brand-${tag}`, hiddenCat: `hp-cat-${tag}`, published: `hp-${tag}-published`, catalogueOnly: `hp-${tag}-catonly` };
const NOW = new Date();
const savedMode = process.env.COMMERCE_MODE;

const approvedPhoto = (slug: string) => ({
  url: `https://example.test/${slug}.webp`, alt: slug, isPrimary: true, licence: "manufacturer-official-dealer-use",
  sha256: "f".repeat(64), sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT" as const,
  approvedAt: NOW, approvedBy: "test-reviewer", approvalReason: "Synthetic fixture",
});
const identity = { identityConfirmed: true, identityApprovedAt: NOW, identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic fixture" };

before(async () => {
  ids.taxed = (await db.category.findUniqueOrThrow({ where: { slug: TAXED } })).id;
  ids.hiddenCat = (await db.category.create({ data: { slug: slugs.hiddenCat, name: `HP ${tag}`, isActive: false } })).id;
  ids.brand = (await db.brand.create({ data: { slug: slugs.brand, name: `HP ${tag}`, isActive: false } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `HP ${tag}`, city: "Srinagar", pincode: "190001" } })).id;

  // A complete, reviewed offer under a HIDDEN brand, in a taxed category, still catalogue-only.
  const tax = CATEGORY_TAX_CONFIGS[TAXED];
  const p = await db.product.create({ data: {
    slug: slugs.published, title: `HP ${tag} drill`, status: "catalog_only", brandId: ids.brand, categoryId: ids.taxed,
    unitLabel: "per piece", deliverySpeed: "scheduled", ...identity, images: { create: approvedPhoto(slugs.published) },
  } });
  ids.published = p.id;
  const v = await db.productVariant.create({ data: { productId: p.id, sku: `HP-${tag}`, name: "Default", pricePaise: 120000, compareAtPaise: 150000, isDefault: true } });
  ids.publishedVariant = v.id;
  await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouse, qtyOnHand: 5 } });
  // A guest cart takes stock from the warehouse the cart resolves, not the fixture's own.
  const cartWarehouse = await resolveWarehouseId(null);
  if (cartWarehouse && cartWarehouse !== ids.warehouse) {
    await db.inventory.create({ data: { variantId: v.id, warehouseId: cartWarehouse, qtyOnHand: 5 } });
  }
  await db.product.update({ where: { id: p.id }, data: { commercialReview: {
    approvedBy: "test-reviewer", approvedAt: NOW.toISOString(), reason: "Synthetic fixture", unitLabel: "per piece",
    deliverySpeed: "scheduled", hsn: tax.hsn, gstRatePct: tax.ratePct, inventoryMode: "tracked",
    variants: [{ sku: `HP-${tag}`, pack: "One unit", name: "Default", isDefault: true, pricePaise: 120000, compareAtPaise: 150000 }],
  } as Prisma.InputJsonObject } });

  // An identity-approved product in a HIDDEN category, still a draft.
  ids.catalogueOnly = (await db.product.create({ data: {
    slug: slugs.catalogueOnly, title: `HP ${tag} tile`, status: "draft", brandId: ids.brand, categoryId: ids.hiddenCat,
    ...identity, images: { create: approvedPhoto(slugs.catalogueOnly) },
  } })).id;
});

after(async () => {
  process.env.COMMERCE_MODE = savedMode;
  const products = [ids.published, ids.catalogueOnly];
  await db.cartItem.deleteMany({ where: { variantId: ids.publishedVariant } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [...products, ids.brand, ids.hiddenCat] } } });
  await db.inventory.deleteMany({ where: { variantId: ids.publishedVariant } });
  await db.inventory.deleteMany({ where: { warehouseId: ids.warehouse } });
  await db.productImage.deleteMany({ where: { productId: { in: products } } });
  await db.productVariant.deleteMany({ where: { productId: { in: products } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.warehouse.delete({ where: { id: ids.warehouse } });
  await db.brand.delete({ where: { id: ids.brand } });
  await db.category.delete({ where: { id: ids.hiddenCat } });
});

const shownAnywhere = async (slug: string, title: string) => ({
  pdp: (await getProductBySlug(slug)) !== null,
  listing: (await listProducts({ search: title, perPage: 48 })).items.some((i) => i.slug === slug),
  suggestions: (await getSuggestions(title)).products.some((p) => p.slug === slug),
});

test("ordering open: a product is published while its brand is hidden, and no customer can see or buy it", async () => {
  process.env.COMMERCE_MODE = "transactional";
  const r = await setProductStatus(ids.published, "published", ACTOR);
  assert.deepEqual(r, { ok: true, changed: true, slug: slugs.published }, "preparation is allowed under a hidden brand");

  assert.deepEqual(await shownAnywhere(slugs.published, `HP ${tag} drill`), { pdp: false, listing: false, suggestions: false });
  const anonId = randomUUID();
  try {
    await assert.rejects(addItem(null, anonId, ids.publishedVariant, 1), /Variant not found|not for sale/);
  } finally {
    await db.cart.deleteMany({ where: { anonId } });
  }
  await assert.rejects(
    db.$transaction((tx) => assertCheckoutCatalogue(tx, [{ variantId: ids.publishedVariant, title: "drill", basePricePaise: 120000 }])),
    /OUT_OF_STOCK/,
    "checkout refuses it inside the order transaction",
  );
});

test("switching the brand on shows the prepared product with no further write; switching it off hides it again", async () => {
  process.env.COMMERCE_MODE = "transactional";
  const before = await db.product.findUniqueOrThrow({ where: { id: ids.published }, select: { status: true, commercialReview: true, updatedAt: true } });
  assert.equal(await setBrandActive(slugs.brand, true, { id: "00000000-0000-0000-0000-000000000000", email: ACTOR.email }), "changed");
  try {
    assert.deepEqual(await shownAnywhere(slugs.published, `HP ${tag} drill`), { pdp: true, listing: true, suggestions: true });
    const anonId = randomUUID();
    try {
      await addItem(null, anonId, ids.publishedVariant, 1);
    } finally {
      await db.cart.deleteMany({ where: { anonId } });
    }
    assert.deepEqual(
      await db.product.findUniqueOrThrow({ where: { id: ids.published }, select: { status: true, commercialReview: true, updatedAt: true } }),
      before,
      "showing the brand wrote nothing to the product",
    );
  } finally {
    await setBrandActive(slugs.brand, false, { id: "00000000-0000-0000-0000-000000000000", email: ACTOR.email });
  }
  assert.deepEqual(await shownAnywhere(slugs.published, `HP ${tag} drill`), { pdp: false, listing: false, suggestions: false });
});

test("catalogue mode: a product goes catalogue-only inside a hidden category, and the category stays out of the directory and API", async () => {
  process.env.COMMERCE_MODE = "catalogue";
  await setBrandActive(slugs.brand, true, { id: "00000000-0000-0000-0000-000000000000", email: ACTOR.email });
  try {
    const r = await setProductStatus(ids.catalogueOnly, "catalog_only", ACTOR);
    assert.equal(r.ok, true, "preparation is allowed under a hidden category");

    assert.deepEqual(await shownAnywhere(slugs.catalogueOnly, `HP ${tag} tile`), { pdp: false, listing: false, suggestions: false });
    const inDirectory = async () => (await listCategoryDirectory()).some((g) => g.categories.some((c) => c.slug === slugs.hiddenCat));
    assert.equal(await inDirectory(), false, "/api/v1/categories and the web directory leave the hidden category out");

    assert.equal(await setCategoryActive(slugs.hiddenCat, true, ACTOR), "changed");
    try {
      assert.deepEqual(await shownAnywhere(slugs.catalogueOnly, `HP ${tag} tile`), { pdp: true, listing: true, suggestions: true });
      assert.equal(await inDirectory(), true);
    } finally {
      await setCategoryActive(slugs.hiddenCat, false, ACTOR);
    }
    assert.equal(await inDirectory(), false);
  } finally {
    await setBrandActive(slugs.brand, false, { id: "00000000-0000-0000-0000-000000000000", email: ACTOR.email });
  }
});

test("preparation never skips the product's own readiness: a product without an approved photo is still refused", async () => {
  const bare = await db.product.create({ data: { slug: `hp-${tag}-bare`, title: `HP ${tag} bare`, status: "draft", brandId: ids.brand, categoryId: ids.hiddenCat } });
  try {
    const r = await setProductStatus(bare.id, "catalog_only", ACTOR);
    assert.equal(r.ok, false);
    if (!r.ok && r.code === "GATE_REFUSED") assert.match(r.reasons.join(" "), /photo/);
  } finally {
    await db.auditLog.deleteMany({ where: { entityId: bare.id } });
    await db.product.delete({ where: { id: bare.id } });
  }
});
