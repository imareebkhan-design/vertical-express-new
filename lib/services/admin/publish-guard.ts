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
