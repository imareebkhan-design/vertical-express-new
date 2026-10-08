import "server-only";
import type { DbClient } from "@/lib/services/audit";

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
