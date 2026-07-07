import type { CatalogItem } from "@/lib/services/catalog";
import { ProductCard } from "@/components/product-card";
import { paiseToRupees } from "@/lib/money";

/** Adapts DB catalog items onto the shared ProductCard. */
export function CatalogGrid({
  items,
  wishlistedIds,
}: {
  items: CatalogItem[];
  wishlistedIds?: Set<string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 [&_article]:w-full [&_article]:sm:w-full">
      {items.map((item) => (
        <ProductCard
          key={item.id}
          href={`/product/${item.slug}`}
          productId={item.id}
          wishlisted={wishlistedIds?.has(item.id) ?? false}
          product={{
            id: item.variantId,
            title: item.title,
            brandLine: item.brandName,
            price: paiseToRupees(item.pricePaise),
            compareAt: paiseToRupees(item.compareAtPaise ?? item.pricePaise),
            unit: item.unitLabel,
            image: item.imageUrl ?? undefined,
            bulkNote: item.hasBulkTiers ? "Bulk prices available" : undefined,
          }}
        />
      ))}
    </div>
  );
}
