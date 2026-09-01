"use client";

import Link from "next/link";
import type { CatalogItem } from "@/lib/services/catalog";
import { formatPaise, discountPercent } from "@/lib/money";
import { ProductPanel, isGenericPlaceholder } from "@/components/ui/product-panel";
import { SpeedChip, speedClassFor } from "@/components/ui/speed-chip";
import { AddToCartButton } from "@/components/shop/add-to-cart-button";

/**
 * Dense one-column row for spec-driven categories — cement, wire, ply, pipe.
 *
 * The buyer already knows what they want and is comparing numbers, so brand,
 * grade, pack, price, MRP, delivery speed and the add control all have to be
 * legible at once. That does not fit a 170px card, which is why these categories
 * do not use the grid. See lib/catalog-presentation.ts.
 */
export function CatalogRow({ item }: { item: CatalogItem }) {
  const off = discountPercent(item.pricePaise, item.compareAtPaise);

  return (
    <article className="flex items-center gap-4 rounded-[22px] bg-paper border border-line p-3.5 shadow-card sm:gap-5 sm:p-4">
      <Link
        href={`/product/${item.slug}`}
        className="flex-none overflow-hidden rounded-[1rem] bg-canvas"
        tabIndex={-1}
        aria-hidden
      >
        {item.imageUrl && !isGenericPlaceholder(item.imageUrl) ? (
          /* next/image has no remotePatterns configured here; matches ProductCard. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="size-[76px] object-contain p-1.5 sm:size-[92px]"
          />
        ) : (
          <ProductPanel
            categorySlug={item.categorySlug}
            label={item.title}
            className="size-[76px] sm:size-[92px]"
          />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
          {item.brandName}
        </p>
        <h3 className="mt-1 line-clamp-2 text-[13px] font-bold leading-snug sm:text-sm">
          <Link href={`/product/${item.slug}`} className="hover:underline">
            {item.title}
          </Link>
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[11px] font-semibold text-ink-500">{item.unitLabel}</p>
          {/* On a phone this sits with the spec line; the desktop row has room
              for it in the right-hand column and keeps it there. */}
          <span className="sm:hidden">
            <SpeedChip speed={speedClassFor(item.categoryIsBulk, item.deliverySpeed)} />
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base font-extrabold tabular-nums">
            {formatPaise(item.pricePaise)}
          </span>
          {item.compareAtPaise && item.compareAtPaise > item.pricePaise && (
            <s className="text-xs font-semibold tabular-nums text-ink-300">
              {formatPaise(item.compareAtPaise)}
            </s>
          )}
          {off && (
            <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-extrabold">
              {off}% off
            </span>
          )}
          {!item.inStock && (
            <span className="rounded-full bg-chip px-2 py-0.5 text-[10px] font-bold text-ink-500">
              Out of stock
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-none flex-col items-end justify-between gap-3 self-stretch py-0.5">
        <span className="hidden sm:block">
          <SpeedChip speed={speedClassFor(item.categoryIsBulk, item.deliverySpeed)} />
        </span>
        <AddToCartButton variantId={item.variantId} title={item.title} disabled={!item.inStock} />
      </div>
    </article>
  );
}
