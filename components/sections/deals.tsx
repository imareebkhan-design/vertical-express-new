"use client";

import Link from "next/link";
import { ChevronRight, Plus, Check, Zap } from "lucide-react";
import type { CatalogItem } from "@/lib/services/catalog";
import { useCart } from "@/hooks/use-cart";
import { formatINR } from "@/lib/utils";
import { useState } from "react";

export function Deals({ items }: { items: CatalogItem[] }) {
  return (
    <section id="deals" className="pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        {/* Section Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
              Deals this week
            </h2>
            <p className="mt-1.5 text-[13.5px] font-medium text-ink-700">
              <span className="text-ink font-semibold">Prices valid to 31 Aug</span> · while stock lasts
            </p>
          </div>

          <Link
            href="/categories"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-paper px-4 text-[12.5px] font-bold text-ink shadow-card hover:bg-hush transition-colors shrink-0"
          >
            <span>See all deals</span>
            <ChevronRight className="size-3.5" />
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
  const compareAtRupees = (item.compareAtPaise ?? item.pricePaise) / 100;
  const discountPercent = compareAtRupees > priceRupees
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
    <div className="group flex flex-col rounded-[22px] bg-paper p-2.5 shadow-card border border-line transition-shadow hover:shadow-card-hover">
      {/* Visual / Image preview box */}
      <Link
        href={`/product/${item.slug}`}
        className="relative flex h-[200px] w-full items-center justify-center overflow-hidden rounded-[16px] bg-civil-soft text-ink-700 no-underline"
        style={{
          backgroundColor: isExpress ? "var(--t-elec)" : "var(--t-civil)",
        }}
      >
        {item.imageUrl && item.imageUrl !== "/placeholder-product.webp" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="size-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <svg className="size-20 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
          </svg>
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

      {/* Info */}
      <div className="p-2 flex-1 flex flex-col">
        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500">
          {item.brandName}
        </div>

        <Link
          href={`/product/${item.slug}`}
          className="mt-1 line-clamp-1 text-[14.5px] font-bold text-ink hover:text-brand-deep transition-colors no-underline"
        >
          {item.title}
        </Link>

        <div className="mt-0.5 line-clamp-1 text-[13px] font-medium text-ink-500">
          {item.unitLabel || "Standard pack"}
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-[17px] font-bold text-ink">
            {formatINR(priceRupees)}
          </span>
        </div>

        <div className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {/* unitLabel already reads "per bag" / "per can" — prefixing another
              "per" produced "per per can". */}
          {item.unitLabel || "per unit"} · MRP {formatINR(compareAtRupees)}
        </div>

        <div className="mt-2.5 pt-1">
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
    </div>
  );
}

