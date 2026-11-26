"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryTile } from "@/components/categories/category-tile";
import type { DirectoryGroup } from "@/lib/category-directory";

/**
 * Shop by category — the departments a shopper scans to find their aisle.
 *
 * Arranged by `lib/category-directory.ts`: the four material departments first,
 * in the order a building goes up, then Tools & Equipment. The order is the
 * shop's structure, not whichever category had products approved first, so
 * a large tools catalogue never leads the page.
 *
 * Tiles carry no product count: a number under a tile is noise to a shopper
 * and, written by hand, it was wrong (879 claimed against 30 held). A
 * department category with nothing approved yet shows as "Coming soon".
 */
export function Categories({ directory }: { directory: DirectoryGroup[] }) {
  if (directory.length === 0) return null;

  return (
    <section id="categories" aria-labelledby="categories-title" className="ve-reveal pt-14">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 id="categories-title" className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
            Shop by category
          </h2>
          <Link
            href="/categories"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-ink no-underline hover:text-ink-700"
          >
            All categories
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        <div className="mt-6 space-y-9">
          {directory.map((group) => (
            <section key={group.key} aria-labelledby={`dept-${group.key}`}>
              <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
                <h3 id={`dept-${group.key}`} className="text-[17px] font-bold tracking-[-0.015em] text-ink">
                  {group.title}
                </h3>
                <Link
                  href={`/categories#${group.key}`}
                  aria-label={`View all ${group.title}`}
                  className="inline-flex flex-none items-center gap-1 text-[12.5px] font-bold text-ink-700 no-underline hover:text-ink"
                >
                  View all
                  <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </div>
              <ul className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-6">
                {group.categories.map((entry) => (
                  <li key={entry.slug}>
                    <CategoryTile entry={entry} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
