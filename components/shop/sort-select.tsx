"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

/**
 * "Popular" was the default and was backed by `Product.ratingCount`, which is
 * zero on every product because no Review model exists and nothing writes it
 * (ISS-034). The key was inert, so the list fell through to newest-first and
 * was presented to the customer as popularity — a ranking claim with nothing
 * behind it, on the control that governs every listing by default.
 *
 * The option is gone rather than relabelled: with the dead key removed it would
 * have been a second entry doing exactly what "Newest" does. A real popularity
 * sort is a product decision the owner has not made — order volume, or a
 * curated order — and ISS-058 keeps it open.
 */
const OPTIONS: { value: string; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Discount" },
];

/** The sort a listing uses when the URL asks for nothing. */
const DEFAULT_SORT = "newest";

/** URL-state sort dropdown shared by PLP and search. */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /* `?sort=popular` still resolves — old links and bookmarks keep working, and
     the service maps it to the same order — but it is shown as what it is. */
  const raw = searchParams.get("sort");
  const current = !raw || raw === "popular" ? DEFAULT_SORT : raw;

  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === DEFAULT_SORT) params.delete("sort");
    else params.set("sort", value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <label className="flex items-center gap-2 text-sm font-bold text-neutral-600">
      <ArrowUpDown className="size-4 text-neutral-400" aria-hidden />
      <span className="sr-only sm:not-sr-only">Sort</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm font-bold transition-colors hover:border-ink focus:border-ink focus:outline-none"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
