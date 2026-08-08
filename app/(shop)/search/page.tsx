import type { Metadata } from "next";
import { listProducts, type CatalogSort } from "@/lib/services/catalog";
import { rupeesToPaise } from "@/lib/money";
import { SearchSwitcher } from "@/components/mobile/search/search-switcher";

export const metadata: Metadata = {
  title: "Search | Vertical Express",
  robots: { index: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q : "";

  // Support comma-separated brands (e.g. brand=slug1,slug2) or multiple query values
  const brandParams = toArray(sp.brand).flatMap(b => b.split(","));

  const result = await listProducts({
    search: query || undefined,
    brandSlugs: brandParams.length ? brandParams : undefined,
    minPaise: sp.minPrice ? rupeesToPaise(Number(sp.minPrice)) : undefined,
    maxPaise: sp.maxPrice ? rupeesToPaise(Number(sp.maxPrice)) : undefined,
    sort: (typeof sp.sort === "string" ? sp.sort : "popular") as CatalogSort,
    page: sp.page ? parseInt(String(sp.page), 10) || 1 : 1,
  });

  const activeFilterCount =
    brandParams.length + (sp.minPrice ? 1 : 0) + (sp.maxPrice ? 1 : 0);

  return (
    <SearchSwitcher
      query={query}
      result={result}
      activeFilterCount={activeFilterCount}
    />
  );
}
