import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@/prisma/generated/client/client";
import { recordAudit, type DbClient } from "@/lib/services/audit";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { sellableReasons } from "@/lib/services/admin/publish-guard";
import { UAT_OPENING_ACTION } from "@/lib/services/admin/uat-inventory";
import { QA_FIXTURE_APPROVER, QA_FIXTURE_BRAND_SLUG, QA_FIXTURE_PREFIX } from "@/lib/catalog/qa-fixture-ids";

/**
 * A few more synthetic, staging-only products for client UAT (owner approval,
 * 8 Nov 2026: "3–5 additional test-only staging products").
 *
 * The single QA fixture (qa-fixture.ts) cannot exercise variant choice, a
 * second category or a scheduled (bulk) delivery. These can. They follow the
 * fixture's rules exactly:
 *   - every slug starts with QA_FIXTURE_PREFIX, so a strict (production)
 *     catalogue excludes them by rule (lib/catalog-policy.ts);
 *   - titles, brand, photo and approver all say they are tests;
 *   - prices are synthetic QA values with MRP equal to price (no discount);
 *   - categories reuse an existing confirmed HSN/GST mapping; no tax invented;
 *   - published only through the same sellability gate as any product.
 *
 * Stock is written ONCE: 50 units with the client-UAT opening marker, so
 * neither a rerun of this nor scripts/prepare-client-uat.mts replenishes stock
 * that UAT orders consumed.
 */

export interface QaCatalogueVariant { sku: string; name: string; pricePaise: number; isDefault: boolean }
export interface QaCatalogueItem { slug: string; title: string; categorySlug: string; unitLabel: string; variants: QaCatalogueVariant[] }

export const QA_OPENING_STOCK = 50;

export const QA_CATALOGUE: QaCatalogueItem[] = [
  {
    slug: `${QA_FIXTURE_PREFIX}paint-tin`,
    title: "QA TEST ITEM 2 — paint tin, staging only, not for sale",
    categorySlug: "painting", unitLabel: "per tin",
    variants: [{ sku: "QA-STAGING-2", name: "QA tin", pricePaise: 34900, isDefault: true }],
  },
  {
    slug: `${QA_FIXTURE_PREFIX}two-pack-sizes`,
    title: "QA TEST ITEM 3 — two pack sizes, staging only, not for sale",
    categorySlug: "general-hardware-tools", unitLabel: "per pack",
    variants: [
      { sku: "QA-STAGING-3S", name: "QA small pack", pricePaise: 9900, isDefault: true },
      { sku: "QA-STAGING-3L", name: "QA large pack", pricePaise: 24900, isDefault: false },
    ],
  },
  {
    slug: `${QA_FIXTURE_PREFIX}bulk-bag`,
    title: "QA TEST ITEM 4 — bulk bag, staging only, not for sale",
    categorySlug: "cement", unitLabel: "per bag",
    variants: [{ sku: "QA-STAGING-4", name: "QA bag", pricePaise: 42000, isDefault: true }],
  },
];

const IMAGE_PATH = "/qa/qa-test-item.svg";

export interface QaCatalogueResult { slug: string; sellable: string[]; stockCreated: string[] }

export async function upsertQaCatalogue(client: Prisma.TransactionClient, warehouseId: string): Promise<QaCatalogueResult[]> {
  // Share the opening-stock initializer's lock so both setup commands serialize.
  await client.$executeRaw`SELECT pg_advisory_xact_lock(746502608)`;
  const warehouse = await client.warehouse.findUnique({ where: { id: warehouseId }, select: { isActive: true } });
  if (!warehouse?.isActive) throw new Error("An active warehouse is required");
  const brand = await client.brand.upsert({
    where: { slug: QA_FIXTURE_BRAND_SLUG },
    create: { slug: QA_FIXTURE_BRAND_SLUG, name: "VE QA — staging test", isActive: true },
    update: { isActive: true },
    select: { id: true },
  });
  const sha256 = createHash("sha256").update(readFileSync(join(process.cwd(), "public", IMAGE_PATH))).digest("hex");
  const results: QaCatalogueResult[] = [];

  for (const item of QA_CATALOGUE) {
    const tax = CATEGORY_TAX_CONFIGS[item.categorySlug];
    if (!tax) throw new Error(`Category ${item.categorySlug} has no confirmed HSN/GST mapping`);
    const category = await client.category.findUniqueOrThrow({ where: { slug: item.categorySlug }, select: { id: true, isActive: true, isBulk: true } });
    if (!category.isActive) throw new Error(`Category ${item.categorySlug} is inactive`);
    const deliverySpeed = category.isBulk ? "scheduled" : "express";

    const product = await client.product.upsert({
      where: { slug: item.slug },
      create: {
        slug: item.slug, title: item.title, brandId: brand.id, categoryId: category.id, status: "draft",
        description: "Synthetic product for staging UAT. Not a real product, price or stock level.",
        unitLabel: item.unitLabel, deliverySpeed,
      },
      update: { title: item.title, unitLabel: item.unitLabel, deliverySpeed },
      select: { id: true },
    });

    const stockCreated: string[] = [];
    for (const v of item.variants) {
      const variant = await client.productVariant.upsert({
        where: { sku: v.sku },
        create: { productId: product.id, sku: v.sku, name: v.name, pricePaise: v.pricePaise, compareAtPaise: v.pricePaise, isDefault: v.isDefault, isActive: true },
        update: { name: v.name, pricePaise: v.pricePaise, compareAtPaise: v.pricePaise, isDefault: v.isDefault, isActive: true },
        select: { id: true },
      });
      // Opening stock belongs to the SKU, not to each warehouse passed on reruns.
      // Keep the audit marker authoritative even if an inventory row was removed.
      const initialized = await client.auditLog.findFirst({
        where: { action: UAT_OPENING_ACTION, entityType: "product_variant", entityId: variant.id },
        select: { id: true },
      });
      if (initialized || await client.inventory.findFirst({ where: { variantId: variant.id }, select: { id: true } })) continue;
      await client.inventory.create({ data: { variantId: variant.id, warehouseId, qtyOnHand: QA_OPENING_STOCK } });
      await client.stockMovement.create({ data: {
        variantId: variant.id, warehouseId, qtyDelta: QA_OPENING_STOCK, qtyAfter: QA_OPENING_STOCK,
        reason: "recount", actorEmail: "client-uat@example.invalid",
        note: "CLIENT UAT ONLY: synthetic QA product opening stock of 50; not physical inventory",
      } });
      await recordAudit(client, {
        actorType: "system", action: UAT_OPENING_ACTION, entityType: "product_variant", entityId: variant.id,
        before: { qtyOnHand: 0, warehouseId },
        after: { qtyOnHand: QA_OPENING_STOCK, warehouseId, testOnly: true, authorization: "Owner staging UAT instructions, 8 Nov 2026" },
      });
      stockCreated.push(v.sku);
    }

    const imageApproval = {
      sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT" as const, severity: null,
      approvedAt: new Date(), approvedBy: QA_FIXTURE_APPROVER, approvalReason: "Synthetic staging QA fixture — not a product photograph",
    };
    const existing = await client.productImage.findFirst({ where: { productId: product.id, isPrimary: true }, select: { id: true } });
    if (existing) {
      await client.productImage.update({ where: { id: existing.id }, data: { url: IMAGE_PATH, sha256, licence: "synthetic-qa", alt: "QA test item placeholder", ...imageApproval } });
    } else {
      await client.productImage.create({ data: { productId: product.id, url: IMAGE_PATH, alt: "QA test item placeholder", isPrimary: true, sha256, licence: "synthetic-qa", ...imageApproval } });
    }

    const now = new Date();
    await client.product.update({
      where: { id: product.id },
      data: {
        identityConfirmed: true, identityApprovedAt: now, identityApprovedBy: QA_FIXTURE_APPROVER,
        identityApprovalReason: "TEST REVIEW — synthetic staging QA product, not a commercial approval",
        commercialReview: {
          approvedBy: QA_FIXTURE_APPROVER, approvedAt: now.toISOString(),
          reason: "TEST REVIEW — synthetic staging QA prices and stock, not owner data or a commercial approval",
          unitLabel: item.unitLabel, deliverySpeed, hsn: tax.hsn, gstRatePct: tax.ratePct, inventoryMode: "tracked",
          variants: item.variants.map(v => ({ sku: v.sku, pack: v.name, name: v.name, isDefault: v.isDefault, pricePaise: v.pricePaise, compareAtPaise: v.pricePaise })),
        },
      },
    });
    await recordAudit(client, {
      actorType: "system", action: "catalogue.qa_test_review_recorded", entityType: "product", entityId: product.id,
      after: { slug: item.slug, skus: item.variants.map(v => v.sku), testOnly: true, approver: QA_FIXTURE_APPROVER },
    });
    const reasons = await sellableReasons(client, product.id);
    if (reasons.length === 0) await client.product.update({ where: { id: product.id }, data: { status: "published" } });
    results.push({ slug: item.slug, sellable: reasons, stockCreated });
  }
  return results;
}

/** Cleanup: archive and deactivate. Never deletes — placed orders reference them. */
export async function archiveQaCatalogue(client: DbClient): Promise<number> {
  const slugs = QA_CATALOGUE.map(i => i.slug);
  const products = await client.product.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  for (const p of products) {
    await client.product.update({ where: { id: p.id }, data: { status: "archived" } });
    await client.productVariant.updateMany({ where: { productId: p.id }, data: { isActive: false } });
  }
  return products.length;
}
