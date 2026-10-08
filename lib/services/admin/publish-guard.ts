import "server-only";
import type { DbClient } from "@/lib/services/audit";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";

/**
 * Whether a product may be published, and if not, why.
 *
 * Every storefront path prices a product from its variants, so a published
 * product with no active, priced variant is a listing nobody can buy that still
 * shows up in search. The master catalogue's draft ranges (catalogue-range-import)
 * are exactly that until real variants are added. Returns null when publishable.
 */
export async function unpublishableReason(client: DbClient, productId: string): Promise<string | null> {
  const priced = await client.productVariant.count({ where: { productId, isActive: true, pricePaise: { gt: 0 } } });
  return priced > 0 ? null : "A product needs at least one active variant with a price before it can be published";
}

/**
 * Whether a product may be shown as catalog-only, and if not, why.
 *
 * A catalog-only product has no price to sell from, so its photograph carries
 * the listing. It must therefore be an exact product photo that arrived through
 * the provenance-recording image import (licence and sha256 set) and is the
 * product's primary. Demo placeholders and category illustrations carry no
 * provenance, so they can never qualify. The brand and category must be active
 * so the product is reachable from navigation, not just by URL.
 * Returns null when the product may be catalog-only.
 */
export async function catalogOnlyReason(client: DbClient, productId: string): Promise<string | null> {
  const product = await client.product.findUnique({
    where: { id: productId },
    select: {
      brand: { select: { isActive: true } },
      category: { select: { isActive: true } },
      images: { where: { isPrimary: true }, select: { licence: true, sha256: true } },
    },
  });
  if (!product) return "Product not found";
  const primary = product.images[0];
  if (!primary || !primary.licence || !primary.sha256) {
    return "A catalog-only product needs an approved exact product photo as its primary image";
  }
  if (!product.brand.isActive) return "The product's brand is inactive";
  if (!product.category.isActive) return "The product's category is inactive";
  return null;
}

/**
 * Whether a product may be SOLD (published), and if not, every reason why.
 *
 * The commercial readiness gate for the catalog_only → published transition
 * (and any other route to published). Stricter than `unpublishableReason`,
 * which only asks for a priced variant:
 *
 *  - an active DEFAULT variant priced above zero (listings sell the default);
 *  - every active variant priced above zero, with MRP (compare-at) absent or
 *    at least the price;
 *  - an inventory record for the default variant — stock is configured, even
 *    if it is an explicit zero; "unknown" is not allowed to sell;
 *  - an explicit HSN/GST mapping for the category (lib/services/tax.ts). The
 *    checkout's 18%/7308 fallback is a safety net, never a reason to sell;
 *  - an approved exact primary photo (licence + sha256 from the image import);
 *  - an active brand and category.
 *
 * Delivery classification needs no check here: `deliverySpeed` is an enum or
 * null, and null means the category's `isBulk` decides — always defined.
 *
 * Call it with the transaction that performs the status change, after the
 * change, so the check and the write commit or roll back together.
 */
export async function sellableReasons(client: DbClient, productId: string): Promise<string[]> {
  const p = await client.product.findUnique({
    where: { id: productId },
    select: {
      brand: { select: { isActive: true } },
      category: { select: { slug: true, isActive: true } },
      images: { where: { isPrimary: true }, select: { licence: true, sha256: true } },
      variants: {
        where: { isActive: true },
        select: { isDefault: true, pricePaise: true, compareAtPaise: true, inventory: { select: { id: true } } },
      },
    },
  });
  if (!p) return ["Product not found"];
  const reasons: string[] = [];
  const def = p.variants.find((v) => v.isDefault);
  if (!def) reasons.push("No active default variant");
  else if (def.pricePaise <= 0) reasons.push("The default variant has no selling price above zero");
  if (p.variants.some((v) => v.pricePaise <= 0)) reasons.push("An active variant has no selling price above zero");
  if (p.variants.some((v) => v.compareAtPaise != null && v.compareAtPaise < v.pricePaise)) {
    reasons.push("An MRP is below its selling price");
  }
  if (def && def.inventory.length === 0) reasons.push("No stock record for the default variant (enter opening stock, even 0)");
  if (!CATEGORY_TAX_CONFIGS[p.category.slug]) reasons.push(`No confirmed HSN/GST for category ${p.category.slug}`);
  const photo = p.images[0];
  if (!photo?.licence || !photo.sha256) reasons.push("No approved exact product photo as the primary image");
  if (!p.brand.isActive) reasons.push("The brand is inactive");
  if (!p.category.isActive) reasons.push("The category is inactive");
  return reasons;
}
