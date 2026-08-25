import type { CatalogItem } from "@/lib/services/catalog";
import { ProductCard } from "@/components/product-card";
import { CatalogRow } from "@/components/shop/catalog-row";
import { paiseToRupees } from "@/lib/money";
import { speedClassFor } from "@/components/ui/speed-chip";
import { listingLayoutFor } from "@/lib/catalog-presentation";

/**
 * Adapts DB catalog items onto the right listing form for the category.
 *
 * Spec-driven categories render as dense rows, appearance-driven ones as a
 * visual grid. The rule lives in lib/catalog-presentation.ts so it is a system
 * decision rather than a per-screen one.
 */
export function CatalogGrid({
  items,
  wishlistedIds,
  categorySlug,
}: {
  items: CatalogItem[];
  wishlistedIds?: Set<string>;
  /** Drives the layout. Omitted on mixed listings (search), which use the grid. */
  categorySlug?: string | null;
}) {
  if (listingLayoutFor(categorySlug) === "rows") {
    return (
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <CatalogRow key={item.id} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 [&_article]:w-full [&_article]:sm:w-full">
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
            speed: speedClassFor(item.categoryIsBulk),
          }}
        />
      ))}
    </div>
  );
}
