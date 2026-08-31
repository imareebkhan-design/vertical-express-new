import React from "react";
import Link from "next/link";
import type { CatalogFacets } from "@/lib/services/catalog";
import { attributeConfigFor } from "@/lib/catalog-attributes";
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
 * The "Shop by …" rail: the first question a buyer of this category asks.
 *
 * Cement is chosen by grade. Tile is chosen by type first — vitrified or
 * ceramic — then size and finish. Which attribute leads is configured per
 * category in lib/catalog-attributes.ts; the values come from the products
 * themselves, so a category shows exactly what it stocks.
 *
 * Below two distinct values there is nothing to choose between, so the rail
 * hides itself rather than showing a single card.
 */
export function ShopByAttribute({
  facets,
  slug,
}: {
  facets: CatalogFacets;
  slug: string;
}) {
  const { railLabel } = attributeConfigFor(slug);
  const lead = facets.attributes[0];

  if (!lead || lead.values.length < 2) return null;

  return (
    <section className="mb-9">
      <h2 className="mb-4 text-[20px] font-bold tracking-[-0.02em] text-ink">
        {railLabel ?? `Shop by ${lead.label.toLowerCase()}`}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {lead.values.map(({ value, count }) => (
          <Link
            key={value}
            href={`/category/${slug}?${lead.label.toLowerCase()}=${encodeURIComponent(value)}`}
            className="rounded-[20px] bg-paper p-4 no-underline shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div
              className="mb-3 flex h-14 w-full items-center justify-center rounded-[14px]"
              style={{ backgroundColor: categoryTint(slug) }}
            >
              <CategoryGlyph name={glyphFor(slug)} className="size-7" />
            </div>
            <p className="text-[13px] font-bold leading-[17px] text-ink">{value}</p>
            <p className="mt-1 text-[11px] font-semibold tabular-nums text-ink-500">
              {count} {count === 1 ? "product" : "products"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
