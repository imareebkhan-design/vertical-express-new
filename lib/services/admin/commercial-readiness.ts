import "server-only";
import { z } from "zod";
import type { DbClient } from "@/lib/services/audit";
import { catalogIdentityWhere } from "@/lib/catalog-policy";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { priceProblem } from "./variant-pricing";

const text = z.string().trim().min(1);
export const commercialReviewSchema = z.object({
  approvedBy: text,
  approvedAt: z.iso.datetime(),
  reason: text,
  unitLabel: text,
  deliverySpeed: z.enum(["express", "scheduled"]),
  hsn: z.string().regex(/^\d{4}(?:\d{2})?(?:\d{2})?$/),
  gstRatePct: z.number().min(0).max(100),
  inventoryMode: z.literal("tracked"),
  variants: z.array(z.object({
    sku: text, pack: text, name: text, isDefault: z.boolean(),
    pricePaise: z.number().int().positive(), compareAtPaise: z.number().int().positive().nullable(),
  }).strict()).min(1),
}).strict();

/** Checks current data, never trusts a preview or guesses a missing commercial value. */
export async function validateCommercialReadiness(client: DbClient, productId: string): Promise<string[]> {
  const issues: string[] = [];
  const p = await client.product.findUnique({
    where: { id: productId },
    include: { category: true, variants: { where: { isActive: true }, include: { inventory: { include: { warehouse: true } } } } },
  });
  if (!p) return ["Product not found"];
  if (!await client.product.findFirst({ where: { id: productId, AND: [catalogIdentityWhere()] }, select: { id: true } })) {
    issues.push("Confirmed identity, approved primary image and active brand/category are required");
  }
  const review = commercialReviewSchema.safeParse(p.commercialReview);
  if (!review.success) issues.push("Explicit owner commercial review is missing or incomplete");
  else {
    const r = review.data;
    if (r.unitLabel !== p.unitLabel) issues.push("Unit/pack review does not match the product");
    if (r.deliverySpeed !== p.deliverySpeed) issues.push("Delivery classification has not been confirmed for this product");
    const tax = CATEGORY_TAX_CONFIGS[p.category.slug];
    if (!tax || tax.hsn !== r.hsn || tax.ratePct !== r.gstRatePct) issues.push("Owner tax review does not match an explicit checkout tax mapping");
    const reviewedSkus = new Set(r.variants.map(v => v.sku));
    if (reviewedSkus.size !== r.variants.length || reviewedSkus.size !== p.variants.length || p.variants.some(v => !reviewedSkus.has(v.sku))) {
      issues.push("Each active SKU requires one explicit pack review");
    }
    for (const variant of p.variants) {
      const approved = r.variants.find(v => v.sku === variant.sku);
      if (approved && (approved.name !== variant.name || approved.isDefault !== variant.isDefault
        || approved.pricePaise !== variant.pricePaise || approved.compareAtPaise !== variant.compareAtPaise)) {
        issues.push(`${variant.sku}: variant or price has changed since commercial review`);
      }
    }
  }
  if (p.variants.filter(v => v.isDefault).length !== 1) issues.push("Exactly one active default variant is required");
  for (const v of p.variants) {
    if (!v.sku.trim() || !v.name.trim()) issues.push("SKU and variant name are required");
    const price = priceProblem(v.pricePaise, v.compareAtPaise);
    if (price) issues.push(`${v.sku}: ${price}`);
    if (!v.inventory.some(i => i.warehouse.isActive)) issues.push(`${v.sku}: explicit stock at an active warehouse is required (zero is allowed)`);
    if (v.inventory.some(i => i.qtyOnHand < 0 || i.qtyReserved < 0 || i.qtyReserved > i.qtyOnHand)) issues.push(`${v.sku}: stock state is inconsistent`);
  }
  return issues;
}
