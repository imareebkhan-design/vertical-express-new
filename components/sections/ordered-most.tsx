"use client";

import { useState } from "react";
import Link from "next/link";
import { ProductPanel, isGenericPlaceholder } from "@/components/ui/product-panel";
import { ChevronRight, Plus, Check } from "lucide-react";
import type { CatalogItem } from "@/lib/services/catalog";
import { isPurchasableItem, type PurchasableCatalogItem } from "@/lib/catalog-visibility";
import { useCart } from "@/hooks/use-cart";
import { formatINR } from "@/lib/utils";

export function OrderedMost({ items }: { items: CatalogItem[] }) {
  /* Evidence-bound, like every other "most ordered" rail in this codebase
     (see components/shop/most-ordered.tsx) — a heading with nothing under it
     is worse than no section, and `items` is real order volume now (see
     app/page.tsx), so it is genuinely empty until real orders exist. */
  if (items.length === 0) return null;

  return (
    <section className="pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        {/* Section Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
              Ordered most in Srinagar
            </h2>
          </div>

          <Link
            href="/categories"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-paper px-4 text-[12.5px] font-bold text-ink shadow-card hover:bg-hush transition-colors shrink-0"
          >
            <span>See all</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* 2-Column Grid */}
        <div className="mt-6 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {items.filter(isPurchasableItem).slice(0, 6).map((item) => (
            <OrderedMostCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function OrderedMostCard({ item }: { item: PurchasableCatalogItem }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const priceRupees = item.pricePaise / 100;
  const compareAtRupees = item.compareAtPaise ? item.compareAtPaise / 100 : null;
  const discountPercent = compareAtRupees && compareAtRupees > priceRupees
    ? Math.round(((compareAtRupees - priceRupees) / compareAtRupees) * 100)
    : 0;


  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await addItem(item.variantId, 1, item.title);
    if (ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    }
  };

  return (
    <div className="group flex items-center gap-4.5 rounded-[22px] bg-paper p-3.5 shadow-card border border-line transition-shadow hover:shadow-card-hover">
      {/* 92x92px Image Tile */}
      <Link
        href={`/product/${item.slug}`}
        aria-label={item.title}
        className="relative flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-chip-soft no-underline"
      >
        {!isGenericPlaceholder(item.imageUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl ?? ""}
            alt=""
            className="size-full object-contain p-2 transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <ProductPanel categorySlug={item.categorySlug} label={item.title} className="size-full" />
        )}
      </Link>

      {/* Middle info */}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500">
          {item.brandName}
        </div>

        <Link
          href={`/product/${item.slug}`}
          className="mt-0.5 block truncate text-[14.5px] font-bold text-ink hover:text-brand-deep transition-colors no-underline"
        >
          {item.title}
        </Link>

        <div className="mt-0.5 truncate text-[13px] font-medium text-ink-500">
          {item.unitLabel || "Standard pack"}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[15.5px] font-bold text-ink">
            {formatINR(priceRupees)}
          </span>

          {compareAtRupees && compareAtRupees > priceRupees && (
            <span className="text-[13px] font-medium text-ink-500 line-through">
              {formatINR(compareAtRupees)}
            </span>
          )}

          {discountPercent > 0 && (
            <span className="flex h-[21px] items-center rounded-chip bg-brand px-1.5 text-[10px] font-extrabold text-ink">
              {discountPercent}% off
            </span>
          )}

          
        </div>
      </div>

      {/* Right: Add to cart button */}
      <div className="shrink-0">
        <button
          onClick={handleAdd}
          aria-label={`Add ${item.title} to cart`}
          className="flex size-10 items-center justify-center rounded-full bg-ink text-white shadow-card hover:bg-ink/80 transition-colors cursor-pointer"
        >
          {added ? <Check className="size-4 text-brand" /> : <Plus className="size-4" />}
        </button>
      </div>
    </div>
  );
}
