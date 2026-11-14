"use client";

import Link from "next/link";
import type { CatalogFacets } from "@/lib/services/catalog";
import { attributeConfigFor } from "@/lib/catalog-attributes";
import { triggerHaptic } from "@/lib/native/haptics";

/**
 * "Shop by grade" — the subcategory artboard's lead rail, on mobile.
 *
 * The web branch has had this since the category work; the mobile branch never
 * got it, so a customer on a phone saw an undifferentiated grid of cement bags
 * and no way to say which grade they were after. That is the wrong way round:
 * the phone is where this decision actually gets made, standing in front of a
 * half-built slab.
 *
 * Values and counts come from the facets the catalogue already computes, so a
 * category shows exactly what it stocks and nothing it does not.
 *
 * Below two distinct values there is nothing to choose between, so the rail
 * hides rather than showing a single card — same rule as the web version.
 */
export function MobileAttributeRail({
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
    <section aria-labelledby="attribute-rail" className="px-4 pt-4">
      <h2
        id="attribute-rail"
        className="text-[17px] font-extrabold tracking-[-0.02em] text-ink"
      >
        {railLabel ?? `Shop by ${lead.label.toLowerCase()}`}
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {lead.values.map(({ value, count }) => (
          <Link
            key={value}
            href={`/category/${slug}?${lead.label.toLowerCase()}=${encodeURIComponent(value)}`}
            onClick={() => triggerHaptic("light")}
            className="rounded-[18px] bg-paper p-3.5 no-underline shadow-card active:opacity-90"
          >
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
