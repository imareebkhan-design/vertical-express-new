import "server-only";
import type { DbClient } from "./audit";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { validateCommercialReadiness } from "./admin/commercial-readiness";

/** Recheck after the gateway wait, in the transaction that creates the order. */
export async function assertCheckoutCatalogue(
  tx: DbClient,
  lines: ReadonlyArray<{ variantId: string; title: string; basePricePaise: number }>,
): Promise<void> {
  // Hold the reviewed identity, images and offer stable until the order commits.
  // Inventory remains independently guarded by checkout's atomic decrement.
  await tx.$queryRaw`
    SELECT p.id FROM products p
    JOIN product_variants v ON v.product_id = p.id
    JOIN product_images i ON i.product_id = p.id
    JOIN brands b ON b.id = p.brand_id
    JOIN categories c ON c.id = p.category_id
    WHERE v.id = ANY(${lines.map(line => line.variantId)}::uuid[])
    ORDER BY p.id, v.id, i.id
    FOR SHARE OF p, v, i, b, c
  `;
  const checked = new Set<string>();
  for (const line of lines) {
    const variant = await tx.productVariant.findFirst({
      where: { id: line.variantId, isActive: true, product: { status: "published", AND: [catalogListingWhere()] } },
      select: { productId: true, pricePaise: true },
    });
    if (!variant) throw new Error(`OUT_OF_STOCK:${line.title}`);
    if (variant.pricePaise !== line.basePricePaise) throw new Error(`OUT_OF_STOCK:${line.title}`);
    if (!checked.has(variant.productId)) {
      if ((await validateCommercialReadiness(tx, variant.productId)).length) throw new Error(`OUT_OF_STOCK:${line.title}`);
      checked.add(variant.productId);
    }
  }
}
