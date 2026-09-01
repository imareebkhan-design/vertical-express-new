"use client";

import Link from "next/link";
import { triggerHaptic } from "@/lib/native/haptics";

/**
 * "Brands we stock" — the subcategory artboard.
 *
 * Trade buyers shop by brand more than by anything else. A contractor who has
 * always used one cement is not browsing the grid, they are looking for a name,
 * and this is the shortcut past it.
 *
 * Only brands with a published product in this category are listed, so a chip
 * never leads to an empty result. Below two there is nothing to choose between
 * and the strip hides itself — the same rule as the attribute rail.
 */
export function BrandStrip({
  slug,
  brands,
}: {
  slug: string;
  brands: { slug: string; name: string; count: number }[];
}) {
  if (brands.length < 2) return null;

  return (
    <section aria-labelledby="brands-heading" className="px-4 pt-5">
      <div className="flex items-baseline justify-between">
        <h2 id="brands-heading" className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
          Brands we stock
        </h2>
        <Link
          href={`/category/${slug}`}
          className="text-[11px] font-bold text-ink no-underline"
        >
          All brands
        </Link>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {brands.map((b) => (
          <Link
            key={b.slug}
            href={`/category/${slug}?brand=${encodeURIComponent(b.slug)}`}
            onClick={() => triggerHaptic("light")}
            className="flex-none rounded-full bg-paper px-4 py-2.5 text-[13px] font-bold text-ink no-underline shadow-card active:opacity-90"
          >
            {b.name}
            <span className="ml-1.5 font-semibold text-ink-500">{b.count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
