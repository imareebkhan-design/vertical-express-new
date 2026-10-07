"use client";

import Link from "next/link";
import { ChevronRight, Plus, Check } from "lucide-react";
import type { CatalogItem } from "@/lib/services/catalog";
import { useCart } from "@/hooks/use-cart";
import { formatINR } from "@/lib/utils";
import { useState } from "react";
import { ProductPanel, isGenericPlaceholder } from "@/components/ui/product-panel";

export function Deals({ items }: { items: CatalogItem[] }) {
  return (
    <section id="deals" className="ve-reveal pt-14">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">Deals</h2>
          {/* There is no deal end date in the schema, so none is shown. */}
          <Link
            href="/categories"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-ink no-underline hover:text-ink-700"
          >
            See all
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {/* 4-Column Grid */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.slice(0, 4).map((item) => (
            <DealCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DealCard({ item }: { item: CatalogItem }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const priceRupees = item.pricePaise / 100;
  const mrpPaise = item.compareAtPaise !== null && item.compareAtPaise > item.pricePaise ? item.compareAtPaise : null;
  /* Rounded down, so the badge never claims more than the real saving. */
  const discountPercent = mrpPaise ? Math.floor(((mrpPaise - item.pricePaise) * 100) / mrpPaise) : 0;

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
    <div className="group flex flex-col rounded-[22px] bg-paper p-2.5 shadow-card border border-line transition-shadow hover:shadow-card-hover">
      <Link
        href={`/product/${item.slug}`}
        className="relative block h-[200px] w-full overflow-hidden rounded-[16px] no-underline"
      >
        {!isGenericPlaceholder(item.imageUrl) ? (
          <span className="flex size-full items-center justify-center bg-chip-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl ?? ""}
              alt=""
              className="size-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          </span>
        ) : (
          <ProductPanel categorySlug={item.categorySlug} label={item.title} className="size-full" />
        )}

        {/* Discount Badge */}
        {discountPercent > 0 && (
          <div className="absolute left-2.5 top-2.5 flex h-[22px] items-center rounded-chip bg-brand px-2 text-[11px] font-extrabold text-ink">
            {discountPercent}% off
          </div>
        )}

        {/* Plus Action Button */}
        <button
          onClick={handleAdd}
          aria-label={`Add ${item.title} to cart`}
          className="absolute right-2.5 top-2.5 flex size-[34px] items-center justify-center rounded-full bg-ink text-white shadow-card hover:bg-ink/80 transition-colors cursor-pointer"
        >
          {added ? <Check className="size-4 text-brand" /> : <Plus className="size-4" />}
        </button>
      </Link>

      <div className="flex flex-1 flex-col p-2">
        <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.09em] text-ink-500">{item.brandName}</div>
        <Link
          href={`/product/${item.slug}`}
          className="mt-1 line-clamp-2 min-h-10 text-[14px] font-bold leading-5 text-ink no-underline transition-colors hover:text-brand-deep"
        >
          {item.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[17px] font-bold tabular-nums text-ink">{formatINR(priceRupees)}</span>
          {mrpPaise ? (
            <span className="text-[12.5px] font-medium tabular-nums text-ink-500 line-through">{formatINR(mrpPaise / 100)}</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[11.5px] font-medium text-ink-500">{item.unitLabel}</div>
      </div>
    </div>
  );
}

