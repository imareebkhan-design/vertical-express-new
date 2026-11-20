import React from "react";
import Link from "next/link";
import type { CatalogFacets } from "@/lib/services/catalog";
import { attributeConfigFor } from "@/lib/catalog-attributes";
import { ProductPanel, categoryTint } from "@/components/ui/product-panel";

/** The category banner: its name, its description if any, how many products, and its picture. */
export function CategoryBanner({
  name,
  description,
  total,
  slug,
}: {
  name: string;
  description: string | null;
  total: number;
  slug: string;
}) {
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

          <p className="mt-4 text-[13px] font-semibold tabular-nums text-ink-700">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>

        <ProductPanel use="category" categorySlug={slug} label={name} className="hidden size-36 flex-none rounded-[22px] lg:flex" glyphClassName="size-20" />
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
        {lead.values.map(({ value }) => (
          <Link
            key={value}
            href={`/category/${slug}?${lead.label.toLowerCase()}=${encodeURIComponent(value)}`}
            className="rounded-[20px] bg-paper p-4 no-underline shadow-card transition-shadow hover:shadow-card-hover"
          >
            <ProductPanel use="category" categorySlug={slug} label={value} className="mb-3 h-20 w-full rounded-[14px]" glyphClassName="size-8" />
            <p className="text-[13px] font-bold leading-[17px] text-ink">{value}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
