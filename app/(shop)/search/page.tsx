import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import { SortSelect } from "@/components/shop/sort-select";
import { Pagination } from "@/components/shop/pagination";
import { EmptyState } from "@/components/shop/empty-state";
import { FilterSidebar } from "@/components/shop/filter-sidebar";
import { FilterSheet } from "@/components/shop/filter-sheet";
import { listProducts, type CatalogSort } from "@/lib/services/catalog";
import { rupeesToPaise } from "@/lib/money";

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

  const result = await listProducts({
    search: query || undefined,
    brandSlugs: toArray(sp.brand),
    minPaise: sp.minPrice ? rupeesToPaise(Number(sp.minPrice)) : undefined,
    maxPaise: sp.maxPrice ? rupeesToPaise(Number(sp.maxPrice)) : undefined,
    sort: (typeof sp.sort === "string" ? sp.sort : "popular") as CatalogSort,
    page: sp.page ? parseInt(String(sp.page), 10) || 1 : 1,
  });

  const activeFilterCount =
    toArray(sp.brand).length + (sp.minPrice ? 1 : 0) + (sp.maxPrice ? 1 : 0);

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {query ? <>Results for “{query}”</> : "Search"}
          </h1>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            {result.total} {result.total === 1 ? "product" : "products"}
          </p>
        </div>

        {result.total === 0 ? (
          <EmptyState
            title={query ? `No results for “${query}”` : "Start searching"}
            caption="Try a different term or browse our categories — cement, wires, paint, sanitaryware and more."
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
            <div className="hidden lg:block">
              <FilterSidebar facets={result.facets} />
            </div>

            <div>
              <div className="mb-5 flex items-center justify-between gap-3">
                <FilterSheet facets={result.facets} activeCount={activeFilterCount} />
                <SortSelect />
              </div>
              <CatalogGrid items={result.items} />
              <Pagination page={result.page} perPage={result.perPage} total={result.total} />
            </div>
          </div>
        )}
      </main>
      <Footer />
      <FloatingCart />
    </>
  );
}
