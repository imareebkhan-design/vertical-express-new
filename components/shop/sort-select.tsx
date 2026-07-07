"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

const OPTIONS: { value: string; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Discount" },
  { value: "newest", label: "Newest" },
];

/** URL-state sort dropdown shared by PLP and search. */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "popular";

  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "popular") params.delete("sort");
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
        className="cursor-pointer rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-bold transition-colors hover:border-ink focus:border-ink focus:outline-none"
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
