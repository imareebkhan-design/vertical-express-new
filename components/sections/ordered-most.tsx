"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Check, Zap, Snowflake } from "lucide-react";
import type { CatalogItem } from "@/lib/services/catalog";
import { useCart } from "@/hooks/use-cart";
import { formatINR } from "@/lib/utils";

interface OrderedMostProps {
  items: CatalogItem[];
}

export function OrderedMost({ items }: { items: CatalogItem[] }) {
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
          {items.slice(0, 6).map((item) => (
            <OrderedMostCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function OrderedMostCard({ item }: { item: CatalogItem }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const priceRupees = item.pricePaise / 100;
  const compareAtRupees = item.compareAtPaise ? item.compareAtPaise / 100 : null;
  const discountPercent = compareAtRupees && compareAtRupees > priceRupees
    ? Math.round(((compareAtRupees - priceRupees) / compareAtRupees) * 100)
    : 0;

  const isExpress = !item.categoryIsBulk;

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
        className="relative flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] text-ink-700 no-underline"
        style={{
          backgroundColor: isExpress ? "var(--t-elec, #EBF1F5)" : "var(--t-civil, #F0ECE6)",
        }}
      >
        {item.imageUrl && item.imageUrl !== "/placeholder-product.webp" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="size-full object-contain p-2 transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <svg className="size-10 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
          </svg>
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

          {isExpress ? (
            <span className="inline-flex items-center gap-1 rounded-chip bg-brand px-2 py-0.5 text-[11px] font-extrabold text-ink">
              <Zap className="size-3 fill-ink stroke-none" />
              60 min
            </span>
          ) : (
            <span className="inline-flex items-center rounded-chip bg-amber-soft px-2 py-0.5 text-[11px] font-extrabold text-ink">
              Tomorrow, 8 AM
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
