import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";

/** Creates only new synthetic rows; never approves or changes seed/business data. */
export async function createApprovedCatalogueFixture(options: {
  variants?: { name: string; pricePaise: number }[];
} = {}) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.VE_TEST_DATABASE !== "1" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Catalogue fixtures require an explicitly disposable local database");
  }
  const slug = `fixture-approved-${randomUUID()}`;
  const variants = (options.variants ?? [{ name: "Synthetic unit", pricePaise: 10000 }])
    .map((v, index) => ({ ...v, sku: `${slug}-${index}`, isDefault: index === 0 }));
  if (!variants.length) throw new Error("An approved fixture needs at least one variant");
  const category = await db.category.findUniqueOrThrow({ where: { slug: "general-hardware-tools" } });
  const tax = CATEGORY_TAX_CONFIGS[category.slug];
  const { product, brand, warehouse } = await db.$transaction(async tx => {
    const brand = await tx.brand.create({ data: { slug, name: slug } });
    const warehouse = await tx.warehouse.create({ data: { name: slug, city: "Srinagar", pincode: "190001" } });
    const product = await tx.product.create({ data: {
      slug, title: "Synthetic approved fixture", brandId: brand.id, categoryId: category.id,
      status: "published", unitLabel: "per piece", deliverySpeed: "scheduled",
      identityConfirmed: true, identityApprovedAt: new Date(), identityApprovedBy: "test-fixture",
      identityApprovalReason: "Synthetic fixture only",
      commercialReview: { approvedBy: "test-fixture", approvedAt: new Date().toISOString(), reason: "Synthetic fixture only",
        unitLabel: "per piece", deliverySpeed: "scheduled", hsn: tax.hsn, gstRatePct: tax.ratePct,
        inventoryMode: "tracked", variants: variants.map(v => ({ ...v, pack: v.name, compareAtPaise: null })) },
      images: { create: { url: `https://example.test/${slug}.webp`, alt: "Synthetic fixture", isPrimary: true,
        licence: "synthetic-test-only", sha256: "a".repeat(64), sourceVerified: true, identityApproved: true,
        approvalStatus: "APPROVED_EXACT", approvedAt: new Date(), approvedBy: "test-fixture", approvalReason: "Synthetic fixture only" } },
      variants: { create: variants.map(v => ({ ...v,
        inventory: { create: { warehouseId: warehouse.id, qtyOnHand: 10 } } })) },
    }, include: { variants: true } });
    // Variant insertion invalidates any review supplied on the parent create.
    // Record the synthetic review only after the complete offer exists.
    const reviewed = await tx.product.update({ where: { id: product.id }, data: {
      commercialReview: { approvedBy: "test-fixture", approvedAt: new Date().toISOString(), reason: "Synthetic fixture only",
        unitLabel: "per piece", deliverySpeed: "scheduled", hsn: tax.hsn, gstRatePct: tax.ratePct,
        inventoryMode: "tracked", variants: variants.map(v => ({ ...v, pack: v.name, compareAtPaise: null })) },
    } });
    return { product: { ...product, commercialReview: reviewed.commercialReview }, brand, warehouse };
  });
  return { product, category, variant: product.variants[0], async cleanup() {
    // Callers first remove orders, carts or other references they created.
    await db.inventory.deleteMany({ where: { warehouseId: warehouse.id } });
    await db.productImage.deleteMany({ where: { productId: product.id } });
    await db.productVariant.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });
    await db.brand.delete({ where: { id: brand.id } });
    await db.warehouse.delete({ where: { id: warehouse.id } });
  } };
}

/**
 * Records explicit test-only approvals on a product the CALLING TEST created,
 * so commerce tests can keep their own product shapes (categories, GST rates,
 * express flags) under the explicit-approval policy. Every reviewed value is
 * read from the product itself — nothing is guessed — and an untaxed category
 * is refused rather than given a fallback. Disposable local database only.
 *
 * A null deliverySpeed is made explicit as the class the category already
 * implies (bulk → scheduled, otherwise express), which is how every reader
 * resolves it, because the commercial review requires an explicit class.
 */
export async function approveSyntheticProductForSale(productId: string, opts: { allowUntaxed?: boolean } = {}): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.VE_TEST_DATABASE !== "1" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Synthetic approvals require an explicitly disposable local database");
  }
  const p = await db.product.findUniqueOrThrow({
    where: { id: productId },
    include: { category: true, variants: { where: { isActive: true } }, images: { where: { isPrimary: true } } },
  });
  const tax = CATEGORY_TAX_CONFIGS[p.category.slug];
  // Untaxed: identity and photo only (visible, never checkout-ready) when the caller allows it.
  if (!tax && !opts.allowUntaxed) throw new Error(`Test product ${p.slug} is in ${p.category.slug}, which has no HSN/GST mapping; pick a taxed category`);
  const deliverySpeed = p.deliverySpeed ?? (p.category.isBulk ? "scheduled" : "express");
  const now = new Date();
  await db.$transaction(async (tx) => {
    /* Older tests create a single variant without isDefault; the policy needs
       exactly one active default, so the first becomes it. Never a second. */
    if (p.variants.length && !p.variants.some((v) => v.isDefault)) {
      await tx.productVariant.update({ where: { id: p.variants[0].id }, data: { isDefault: true } });
    }
    await tx.product.update({ where: { id: p.id }, data: { deliverySpeed } });
    const currentVariants = await tx.productVariant.findMany({ where: { productId: p.id, isActive: true } });
    await tx.product.update({
      where: { id: p.id },
      data: {
        deliverySpeed,
        identityConfirmed: true, identityApprovedAt: now, identityApprovedBy: "test-fixture",
        identityApprovalReason: "Synthetic test product only",
        commercialReview: !tax ? undefined : {
          approvedBy: "test-fixture", approvedAt: now.toISOString(), reason: "Synthetic test product only",
          unitLabel: p.unitLabel, deliverySpeed, hsn: tax.hsn, gstRatePct: tax.ratePct, inventoryMode: "tracked",
          variants: currentVariants.map((v) => ({ sku: v.sku, pack: v.name, name: v.name,
            isDefault: v.isDefault, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise })),
        },
      },
    });
    const approval = {
      sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT" as const, severity: null,
      approvedAt: now, approvedBy: "test-fixture", approvalReason: "Synthetic test product only",
    };
    const primary = p.images[0];
    if (primary) {
      /* The review trigger revokes approval whenever the bytes (sha256) change,
         so a missing checksum is recorded first and approved second. */
      if (!primary.sha256) {
        await tx.productImage.update({ where: { id: primary.id }, data: { sha256: createHash("sha256").update(p.id).digest("hex") } });
      }
      await tx.productImage.update({ where: { id: primary.id }, data: approval });
    } else {
      await tx.productImage.create({
        data: {
          productId: p.id, url: `https://example.test/${p.slug}.webp`, alt: p.title, isPrimary: true,
          licence: "synthetic-test-only", sha256: createHash("sha256").update(p.id).digest("hex"), ...approval,
        },
      });
    }
  });
}

/**
 * Approves every PUBLISHED product created since `since` (i.e. by the calling
 * test file's setup), after its variants exist. Drafts are left alone, so a
 * test that deliberately creates a hidden product keeps it hidden.
 */
export async function approveTestProductsCreatedSince(since: Date): Promise<void> {
  const rows = await db.product.findMany({ where: { createdAt: { gte: since }, status: "published" }, select: { id: true } });
  for (const r of rows) await approveSyntheticProductForSale(r.id, { allowUntaxed: true });
}
