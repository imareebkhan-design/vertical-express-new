"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import type { CatalogFacets } from "@/lib/services/catalog";
import { Button } from "@/components/ui/button";

/**
 * Brand + price-range filters driven entirely by URL search params so results
 * are shareable and server-rendered. Used on both PLP and search pages.
 */
export function FilterSidebar({ facets }: { facets: CatalogFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedBrands = searchParams.getAll("brand");
  const [minR, setMinR] = useState(
    searchParams.get("minPrice") ?? String(paiseToRupees(facets.priceRange.minPaise))
  );
  const [maxR, setMaxR] = useState(
    searchParams.get("maxPrice") ?? String(paiseToRupees(facets.priceRange.maxPaise))
  );

  const push = (params: URLSearchParams) => {
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const toggleBrand = (slug: string) => {
    const params = new URLSearchParams(searchParams);
    const current = params.getAll("brand");
    params.delete("brand");
    const next = current.includes(slug) ? current.filter((b) => b !== slug) : [...current, slug];
    next.forEach((b) => params.append("brand", b));
    push(params);
  };

  const applyPrice = () => {
    const params = new URLSearchParams(searchParams);
    params.set("minPrice", minR);
    params.set("maxPrice", maxR);
    push(params);
  };

  /* Attribute params are the lowercased label: ?type=Vitrified&finish=Matt.
     One value at a time per attribute — a tile is matt or gloss, not both. */
  const attrKeys = facets.attributes.map((a) => a.label.toLowerCase());
  const selectedAttrs = Object.fromEntries(
    attrKeys.map((k) => [k, searchParams.get(k)]).filter(([, v]) => v)
  ) as Record<string, string>;

  const toggleAttr = (label: string, value: string) => {
    const key = label.toLowerCase();
    const params = new URLSearchParams(searchParams);
    if (params.get(key) === value) params.delete(key);
    else params.set(key, value);
    push(params);
  };

  const hasActiveFilters =
    selectedBrands.length > 0 ||
    Object.keys(selectedAttrs).length > 0 ||
    searchParams.has("minPrice") ||
    searchParams.has("maxPrice");

  const reset = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("brand");
    attrKeys.forEach((k) => params.delete(k));
    params.delete("minPrice");
    params.delete("maxPrice");
    setMinR(String(paiseToRupees(facets.priceRange.minPaise)));
    setMaxR(String(paiseToRupees(facets.priceRange.maxPaise)));
    push(params);
  };

  return (
    <aside aria-label="Filters" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-neutral-500">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={reset}
            className="cursor-pointer text-xs font-bold text-brand-deep hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {facets.brands.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-neutral-400">Brand</h3>
          <ul className="space-y-2">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-neutral-700">
                  <input
                    type="checkbox"
                    checked={selectedBrands.includes(b.slug)}
                    onChange={() => toggleBrand(b.slug)}
                    className="size-4 cursor-pointer accent-brand"
                  />
                  <span className="flex-1">{b.name}</span>
                  <span className="text-xs font-semibold text-neutral-400">{b.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attribute groups — type, size, finish, room — in the order
          lib/catalog-attributes.ts configures for this category. */}
      {facets.attributes.map((group) => (
        <div key={group.label}>
          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-neutral-400">
            {group.label}
          </h3>
          <ul className="space-y-2">
            {group.values.map(({ value, count }) => (
              <li key={value}>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-neutral-700">
                  <input
                    type="checkbox"
                    checked={selectedAttrs[group.label.toLowerCase()] === value}
                    onChange={() => toggleAttr(group.label, value)}
                    className="size-4 cursor-pointer accent-brand"
                  />
                  <span className="flex-1">{value}</span>
                  <span className="text-xs font-semibold text-neutral-400">{count}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* No priced product in the listing (e.g. a catalog-only shelf): a
          0–0 price filter would filter nothing and read as a ₹0 price. */}
      {(facets.priceRange.maxPaise > 0 || searchParams.has("minPrice") || searchParams.has("maxPrice")) && (
      <div>
        <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-neutral-400">Price (₹)</h3>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={minR}
            onChange={(e) => setMinR(e.target.value.replace(/\D/g, ""))}
            aria-label="Minimum price"
            className="h-10 w-full rounded-field border border-neutral-200 px-2 text-sm font-bold focus:border-ink focus:outline-none"
          />
          <span className="text-neutral-400">–</span>
          <input
            inputMode="numeric"
            value={maxR}
            onChange={(e) => setMaxR(e.target.value.replace(/\D/g, ""))}
            aria-label="Maximum price"
            className="h-10 w-full rounded-field border border-neutral-200 px-2 text-sm font-bold focus:border-ink focus:outline-none"
          />
        </div>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={applyPrice}>
          Apply price
        </Button>
      </div>
      )}
    </aside>
  );
}

export { rupeesToPaise };
