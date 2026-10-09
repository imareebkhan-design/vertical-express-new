import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DbClient } from "@/lib/services/audit";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { sellableReasons } from "@/lib/services/admin/publish-guard";
import {
  QA_FIXTURE_APPROVER, QA_FIXTURE_BRAND_SLUG, QA_FIXTURE_PRODUCT_SLUG, QA_FIXTURE_SKU,
} from "@/lib/catalog/qa-fixture-ids";

/**
 * The one sellable product a staging checkout walkthrough can buy while no real
 * product has owner prices yet. Synthetic and labelled everywhere: title, photo
 * ("QA TEST ITEM"), brand, approver ("qa-fixture (not an owner approval)").
 * It reuses an existing taxed category's CONFIRMED rate — no tax rule invented.
 * The caller (scripts/qa-staging-fixture.mts) proves the target is staging.
 */
export interface QaFixtureOptions {
  categorySlug: string;
  warehouseId: string;
  pricePaise: number;
  stock: number;
}

const IMAGE_PATH = "/qa/qa-test-item.svg";

export async function upsertQaFixture(client: DbClient, o: QaFixtureOptions): Promise<{ productId: string; sellable: string[] }> {
  const tax = CATEGORY_TAX_CONFIGS[o.categorySlug];
  if (!tax) throw new Error(`Category ${o.categorySlug} has no confirmed HSN/GST mapping; pick one that does`);
  if (!Number.isInteger(o.pricePaise) || o.pricePaise <= 0 || !Number.isInteger(o.stock) || o.stock < 0) throw new Error("Price and stock must be positive integers");
  const category = await client.category.findUniqueOrThrow({ where: { slug: o.categorySlug }, select: { id: true, isActive: true, isBulk: true } });
  if (!category.isActive) throw new Error(`Category ${o.categorySlug} is inactive`);
  await client.warehouse.findUniqueOrThrow({ where: { id: o.warehouseId }, select: { id: true } });

  const brand = await client.brand.upsert({
    where: { slug: QA_FIXTURE_BRAND_SLUG },
    create: { slug: QA_FIXTURE_BRAND_SLUG, name: "VE QA — staging test", isActive: true },
    update: { isActive: true },
    select: { id: true },
  });
  const deliverySpeed = category.isBulk ? "scheduled" : "express";
  const product = await client.product.upsert({
    where: { slug: QA_FIXTURE_PRODUCT_SLUG },
    create: {
      slug: QA_FIXTURE_PRODUCT_SLUG, title: "QA TEST ITEM — staging only, not for sale",
      description: "Synthetic product for staging checkout QA. Not a real product.",
      brandId: brand.id, categoryId: category.id, status: "draft", unitLabel: "per item", deliverySpeed,
    },
    update: { status: "draft" },
    select: { id: true, unitLabel: true },
  });
  const variant = await client.productVariant.upsert({
    where: { sku: QA_FIXTURE_SKU },
    create: { productId: product.id, sku: QA_FIXTURE_SKU, name: "QA unit", pricePaise: o.pricePaise, isDefault: true, isActive: true },
    update: { pricePaise: o.pricePaise, compareAtPaise: null, isDefault: true, isActive: true },
    select: { id: true, name: true },
  });
  await client.inventory.upsert({
    where: { variantId_warehouseId: { variantId: variant.id, warehouseId: o.warehouseId } },
    create: { variantId: variant.id, warehouseId: o.warehouseId, qtyOnHand: o.stock },
    update: { qtyOnHand: o.stock },
  });

  const sha256 = createHash("sha256").update(readFileSync(join(process.cwd(), "public", IMAGE_PATH))).digest("hex");
  const now = new Date();
  const imageApproval = {
    sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT" as const, severity: null,
    approvedAt: now, approvedBy: QA_FIXTURE_APPROVER, approvalReason: "Synthetic staging QA fixture — not a product photograph",
  };
  const existing = await client.productImage.findFirst({ where: { productId: product.id, isPrimary: true }, select: { id: true } });
  if (existing) {
    await client.productImage.update({ where: { id: existing.id }, data: { url: IMAGE_PATH, sha256, licence: "synthetic-qa", alt: "QA test item placeholder" } });
    await client.productImage.update({ where: { id: existing.id }, data: imageApproval });
  } else {
    await client.productImage.create({ data: { productId: product.id, url: IMAGE_PATH, alt: "QA test item placeholder", isPrimary: true, sha256, licence: "synthetic-qa", ...imageApproval } });
  }
  await client.product.update({
    where: { id: product.id },
    data: {
      identityConfirmed: true, identityApprovedAt: now, identityApprovedBy: QA_FIXTURE_APPROVER,
      identityApprovalReason: "Synthetic staging QA fixture",
      commercialReview: {
        approvedBy: QA_FIXTURE_APPROVER, approvedAt: now.toISOString(), reason: "Synthetic staging QA prices and stock — not owner data",
        unitLabel: product.unitLabel, deliverySpeed, hsn: tax.hsn, gstRatePct: tax.ratePct, inventoryMode: "tracked",
        variants: [{ sku: QA_FIXTURE_SKU, pack: variant.name, name: variant.name, isDefault: true, pricePaise: o.pricePaise, compareAtPaise: null }],
      },
    },
  });
  /* Publish only through the same gate as any product. */
  const reasons = await sellableReasons(client, product.id);
  if (reasons.length === 0) await client.product.update({ where: { id: product.id }, data: { status: "published" } });
  return { productId: product.id, sellable: reasons };
}

/** Cleanup: archive and deactivate. Never deletes — placed orders reference it. */
export async function archiveQaFixture(client: DbClient): Promise<boolean> {
  const p = await client.product.findUnique({ where: { slug: QA_FIXTURE_PRODUCT_SLUG }, select: { id: true } });
  if (!p) return false;
  await client.product.update({ where: { id: p.id }, data: { status: "archived" } });
  await client.productVariant.updateMany({ where: { productId: p.id }, data: { isActive: false } });
  return true;
}
