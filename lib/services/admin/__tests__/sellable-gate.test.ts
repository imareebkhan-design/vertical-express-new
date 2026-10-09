import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/prisma/generated/client/client";
import { sellableReasons, unpublishableReason } from "../publish-guard";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { createProduct } from "../product-create";
import { addItem, getCartSummary } from "../../cart";
import { assertCheckoutCatalogue } from "../../checkout-catalogue";

/**
 * The commercial readiness gate (catalog_only → published). Every requirement
 * is checked on its own: a product complete in all respects passes, and
 * removing any single input produces that input's reason. A listing created
 * straight into `published` that fails the gate leaves nothing behind.
 */
const tag = randomUUID().slice(0, 8);
const ids: Record<string, string> = {};
const TAXED = "general-hardware-tools"; // has an explicit HSN/GST mapping in lib/services/tax.ts

async function complete(x: string, opts: { taxed?: boolean; photo?: boolean; stock?: boolean; mrp?: number | null; price?: number } = {}) {
  const p = await db.product.create({
    data: { slug: `sg-${tag}-${x}`, title: `SG ${tag} ${x}`, status: "catalog_only", brandId: ids.brand, categoryId: opts.taxed === false ? ids.untaxed : ids.taxed,
      identityConfirmed: true, identityApprovedAt: new Date(), identityApprovedBy: "test-reviewer", identityApprovalReason: "Synthetic fixture identity",
      unitLabel: "per piece", deliverySpeed: "scheduled",
      commercialReview: { approvedBy: "test-reviewer", approvedAt: new Date().toISOString(), reason: "Synthetic fixture review", unitLabel: "per piece", deliverySpeed: "scheduled", hsn: CATEGORY_TAX_CONFIGS[TAXED].hsn, gstRatePct: CATEGORY_TAX_CONFIGS[TAXED].ratePct, inventoryMode: "tracked", variants: [{ sku: `SG-${tag}-${x}`, pack: "One synthetic test unit", name: "Default", isDefault: true, pricePaise: opts.price ?? 120000, compareAtPaise: opts.mrp === undefined ? 150000 : opts.mrp }] },
    },
  });
  const v = await db.productVariant.create({
    data: { productId: p.id, sku: `SG-${tag}-${x}`, name: "Default", pricePaise: opts.price ?? 120000, compareAtPaise: opts.mrp === undefined ? 150000 : opts.mrp, isDefault: true },
  });
  if (opts.stock !== false) await db.inventory.create({ data: { variantId: v.id, warehouseId: ids.warehouse, qtyOnHand: 0 } });
  if (opts.photo !== false) {
    await db.productImage.create({ data: { productId: p.id, url: `https://example.test/${x}.webp`, alt: x, isPrimary: true, licence: "manufacturer-official-dealer-use", sha256: "b".repeat(64), sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT", approvedAt: new Date(), approvedBy: "test-reviewer", approvalReason: "Synthetic fixture image" } });
  }
  // Approve the completed offer after variant insertion invalidates its old snapshot.
  await db.product.update({ where: { id: p.id }, data: { commercialReview: p.commercialReview as Prisma.InputJsonObject } });
  return p.id;
}

before(async () => {
  const taxed = await db.category.findUnique({ where: { slug: TAXED } });
  assert.ok(taxed, `${TAXED} must exist in the test database`);
  ids.taxed = taxed.id;
  ids.untaxed = (await db.category.create({ data: { slug: `sg-untaxed-${tag}`, name: `SG Untaxed ${tag}` } })).id;
  ids.brand = (await db.brand.create({ data: { slug: `sg-brand-${tag}`, name: `SG Brand ${tag}` } })).id;
  ids.warehouse = (await db.warehouse.create({ data: { name: `SG WH ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
});

after(async () => {
  const products = await db.product.findMany({ where: { slug: { startsWith: `sg-${tag}-` } }, select: { id: true } });
  const pid = products.map((p) => p.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: pid } } });
  await db.stockMovement.deleteMany({ where: { variant: { productId: { in: pid } } } });
  const carts = await db.cart.findMany({ where: { items: { some: { variant: { productId: { in: pid } } } } }, select: { id: true } });
  await db.cartItem.deleteMany({ where: { variant: { productId: { in: pid } } } });
  await db.cart.deleteMany({ where: { id: { in: carts.map(c => c.id) } } });
  await db.inventory.deleteMany({ where: { warehouseId: ids.warehouse } });
  await db.productImage.deleteMany({ where: { productId: { in: pid } } });
  await db.productVariant.deleteMany({ where: { productId: { in: pid } } });
  await db.product.deleteMany({ where: { id: { in: pid } } });
  await db.warehouse.deleteMany({ where: { id: ids.warehouse } });
  await db.brand.deleteMany({ where: { id: ids.brand } });
  await db.category.deleteMany({ where: { id: ids.untaxed } });
});

test("a product complete in every respect is sellable", async () => {
  assert.deepEqual(await sellableReasons(db, await complete("ok")), []);
});

test("MRP is optional", async () => {
  assert.deepEqual(await sellableReasons(db, await complete("nomrp", { mrp: null })), []);
});

test("licence and checksum alone cannot approve a product photo", async () => {
  const id = await complete("provenance-only");
  await db.productImage.updateMany({ where: { productId: id }, data: { identityApproved: false, approvalStatus: "REVIEW_REQUIRED" } });
  assert.ok((await sellableReasons(db, id)).some(r => /approved primary image/.test(r)));
});

test("already published edits require the complete commercial review too", async () => {
  const id = await complete("published-review");
  await db.product.update({ where: { id }, data: { status: "published", commercialReview: {} } });
  assert.match((await unpublishableReason(db, id)) ?? "", /commercial review/);
});

test("forged cart lines cannot bypass commercial readiness", async () => {
  const id = await complete("forged-cart");
  await db.product.update({ where: { id }, data: { status: "published", commercialReview: {} } });
  const variant = await db.productVariant.findFirstOrThrow({ where: { productId: id } });
  const anonId = randomUUID();
  await db.cart.create({ data: { anonId, items: { create: { variantId: variant.id, qty: 1 } } } });
  // Refused at the public lookup (hidden without commercial approval) or at the sale check.
  await assert.rejects(addItem(null, anonId, variant.id, 1), /Product not for sale|Variant not found/);
  assert.deepEqual((await getCartSummary(null, anonId)).lines, []);
  await assert.rejects(db.$transaction(tx => assertCheckoutCatalogue(tx, [{ variantId: variant.id, title: "Synthetic", basePricePaise: variant.pricePaise }])), /OUT_OF_STOCK/);
});

test("checkout rechecks approval after an earlier eligible quote", async () => {
  const id = await complete("revoked-at-checkout");
  await db.product.update({ where: { id }, data: { status: "published" } });
  const variant = await db.productVariant.findFirstOrThrow({ where: { productId: id } });
  const lines = [{ variantId: variant.id, title: "Synthetic", basePricePaise: variant.pricePaise }];
  await db.$transaction(tx => assertCheckoutCatalogue(tx, lines));
  await db.productImage.updateMany({ where: { productId: id }, data: { identityApproved: false, approvalStatus: "REVIEW_REQUIRED" } });
  await assert.rejects(db.$transaction(tx => assertCheckoutCatalogue(tx, lines)), /OUT_OF_STOCK/);
});

test("an inactive variant is refused even when its product remains approved", async () => {
  const id = await complete("inactive-at-checkout");
  await db.product.update({ where: { id }, data: { status: "published" } });
  const variant = await db.productVariant.findFirstOrThrow({ where: { productId: id } });
  await db.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });
  await assert.rejects(db.$transaction(tx => assertCheckoutCatalogue(tx, [{ variantId: variant.id, title: "Synthetic", basePricePaise: variant.pricePaise }])), /OUT_OF_STOCK/);
});

test("a newly approved price cannot use an earlier checkout quote", async () => {
  const id = await complete("requote");
  await db.product.update({ where: { id }, data: { status: "published" } });
  const variant = await db.productVariant.findFirstOrThrow({ where: { productId: id } });
  const p = await db.product.findUniqueOrThrow({ where: { id } });
  const review = p.commercialReview as Prisma.InputJsonObject;
  await db.productVariant.update({ where: { id: variant.id }, data: { pricePaise: 121000 } });
  await db.product.update({ where: { id }, data: { commercialReview: { ...review,
    variants: [{ sku: variant.sku, pack: "One synthetic test unit", name: variant.name, isDefault: true, pricePaise: 121000, compareAtPaise: variant.compareAtPaise }],
  } } });
  assert.deepEqual(await sellableReasons(db, id), []);
  await assert.rejects(db.$transaction(tx => assertCheckoutCatalogue(tx, [{ variantId: variant.id, title: "Synthetic", basePricePaise: variant.pricePaise }])), /OUT_OF_STOCK/);
});

test("checkout holds image approval stable until the order transaction ends", async () => {
  const id = await complete("locked-review");
  await db.product.update({ where: { id }, data: { status: "published" } });
  const variant = await db.productVariant.findFirstOrThrow({ where: { productId: id } });
  await db.$transaction(async tx => {
    await assertCheckoutCatalogue(tx, [{ variantId: variant.id, title: "Synthetic", basePricePaise: variant.pricePaise }]);
    await assert.rejects(db.$transaction(async other => {
      await other.$executeRaw`SET LOCAL lock_timeout = '100ms'`;
      await other.productImage.updateMany({ where: { productId: id }, data: { identityApproved: false } });
    }), /lock timeout/);
  });
  await db.productImage.updateMany({ where: { productId: id }, data: { identityApproved: false } });
  await assert.rejects(db.$transaction(tx => assertCheckoutCatalogue(tx, [{ variantId: variant.id, title: "Synthetic", basePricePaise: variant.pricePaise }])), /OUT_OF_STOCK/);
});

test("each missing input is reported on its own", async () => {
  const cases: [string, Parameters<typeof complete>[1], RegExp][] = [
    ["nophoto", { photo: false }, /photo/],
    ["nostock", { stock: false }, /stock record/],
    ["notax", { taxed: false }, /HSN\/GST/],
    ["badmrp", { mrp: 100000 }, /MRP is below/],
    ["zeroprice", { price: 0, mrp: null }, /price above zero/],
  ];
  for (const [x, opts, re] of cases) {
    const reasons = await sellableReasons(db, await complete(x, opts));
    assert.ok(reasons.some((r) => re.test(r)), `${x}: ${reasons.join(" | ")}`);
  }
});

test("an inactive brand blocks selling", async () => {
  const id = await complete("brandoff");
  await db.brand.update({ where: { id: ids.brand }, data: { isActive: false } });
  try {
    assert.ok((await sellableReasons(db, id)).some((r) => /brand is inactive/.test(r)));
  } finally {
    await db.brand.update({ where: { id: ids.brand }, data: { isActive: true } });
  }
});

test("a listing created straight into published that fails the gate writes nothing", async () => {
  const slug = `sg-${tag}-direct`;
  const res = await createProduct(
    {
      title: `SG ${tag} direct`, slug, brandId: ids.brand, categoryId: ids.taxed, description: null,
      unitLabel: "per piece", deliverySpeed: null, status: "published", express: { eligible: false, pincodes: [] },
      variant: { name: "Default", sku: `SG-${tag}-DIRECT`, pricePaise: 99900, compareAtPaise: null },
      openingStock: { warehouseId: ids.warehouse, qty: 5 },
    },
    { id: randomUUID(), email: "gate@test.example" }
  );
  assert.equal(res.ok, false);
  assert.ok(!res.ok && res.error === "not_sellable" && res.reasons.some((r) => /photo/.test(r)));
  assert.equal(await db.product.count({ where: { slug } }), 0, "rolled back");
  assert.equal(await db.productVariant.count({ where: { sku: `SG-${tag}-DIRECT` } }), 0);
});
