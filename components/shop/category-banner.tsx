import React from "react";
import Link from "next/link";
import type { CatalogItem, CatalogFacets } from "@/lib/services/catalog";
import { SpeedChip, speedClassFor } from "@/components/ui/speed-chip";
import { CategoryGlyph, categoryTint, glyphFor } from "@/components/ui/product-panel";

/**
 * The category banner: what this category is, how much of it we hold, and how
 * it travels — before any product row.
 *
 * The design leads every category landing page with this. Without it a listing
 * opens straight into rows and never says the one thing that changes how a
 * contractor plans: cement does not come in the 60-minute window.
 */
export function CategoryBanner({
  name,
  description,
  isBulk,
  total,
  brandCount,
  slug,
}: {
  name: string;
  description: string | null;
  isBulk: boolean;
  total: number;
  brandCount: number;
  slug: string;
}) {
  const speed = speedClassFor(isBulk);

  return (
    <section
      className="mb-8 overflow-hidden rounded-[28px] px-8 py-7"
      style={{ backgroundColor: categoryTint(slug) }}
    >
      <div className="flex items-start justify-between gap-8">
        <div className="max-w-[640px]">
          <h1 className="text-[36px] font-extrabold leading-[42px] tracking-[-0.03em] text-ink">
            {name}
          </h1>

          {description && (
            <p className="mt-3 text-[14.5px] font-medium leading-[22px] text-ink-700">
              {description}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-[13px] font-bold tabular-nums text-ink">
              {total} {total === 1 ? "product" : "products"}
            </span>
            {brandCount > 0 && (
              <span className="text-[13px] font-bold tabular-nums text-ink">
                {brandCount} {brandCount === 1 ? "brand" : "brands"}
              </span>
            )}
            <SpeedChip speed={speed} />
          </div>
        </div>

        <CategoryGlyph name={glyphFor(slug)} className="hidden size-24 flex-none lg:block" />
      </div>
    </section>
  );
}

/**
 * "Shop by grade" — the sub-filter a spec-driven buyer actually reaches for.
 *
 * Grades are read from each product's own `specs`, so nothing is invented: a
 * category only shows this rail once its products carry a Grade attribute, and
 * it fills in on its own as the catalogue gets real specs. Below two distinct
 * grades there is nothing to choose between, so the section stays hidden.
 */
export function ShopByGrade({
  items,
  slug,
  facets,
}: {
  items: CatalogItem[];
  slug: string;
  facets?: CatalogFacets;
}) {
  void facets;

  const counts = new Map<string, number>();
  for (const item of items) {
    const grade = item.gradeLabel;
    if (grade) counts.set(grade, (counts.get(grade) ?? 0) + 1);
  }

  if (counts.size < 2) return null;

  const grades = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section className="mb-9">
      <h2 className="mb-4 text-[20px] font-bold tracking-[-0.02em] text-ink">Shop by grade</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {grades.map(([grade, n]) => (
          <Link
            key={grade}
            href={`/category/${slug}?grade=${encodeURIComponent(grade)}`}
            className="rounded-[20px] bg-paper p-4 no-underline shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div
              className="mb-3 flex h-14 w-full items-center justify-center rounded-[14px]"
              style={{ backgroundColor: categoryTint(slug) }}
            >
              <CategoryGlyph name={glyphFor(slug)} className="size-7" />
            </div>
            <p className="text-[13px] font-bold leading-[17px] text-ink">{grade}</p>
            <p className="mt-1 text-[11px] font-semibold tabular-nums text-ink-500">
              {n} {n === 1 ? "product" : "products"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
