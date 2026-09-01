"use client";

import Link from "next/link";
import type { CatalogItem } from "@/lib/services/catalog";
import { MobileProductCard } from "@/components/mobile/home/mobile-product-card";

/**
 * "Most ordered in <category>" — the subcategory artboard.
 *
 * Ranked by units actually ordered, not by the `ratingCount` column the
 * catalogue's "popular" sort used to read, which is empty on every product and
 * silently fell through to newest-first (ISS-058). A section headed "most
 * ordered" backed by that would have been decoration.
 *
 * Renders nothing until something has been ordered. An empty heading is worse
 * than no heading, and filling it with whatever was seeded first is how the old
 * sort got away with it.
 */
export function MostOrdered({
  categoryName,
  slug,
  items,
}: {
  categoryName: string;
  slug: string;
  items: CatalogItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="most-ordered" className="px-4 pt-5">
      <div className="flex items-baseline justify-between">
        <h2 id="most-ordered" className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
          Most ordered in {categoryName}
        </h2>
        <Link
          href={`/category/${slug}?sort=popular`}
          className="text-[11px] font-bold text-ink no-underline"
        >
          See all
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {items.slice(0, 4).map((item) => (
          <MobileProductCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
