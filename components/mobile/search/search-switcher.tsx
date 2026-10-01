"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import type { CatalogResult } from "@/lib/services/catalog";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { SearchBox } from "@/components/shop/search-box";
import { EmptyState } from "@/components/shop/empty-state";
import { FilterSidebar } from "@/components/shop/filter-sidebar";
import { FilterSheet } from "@/components/shop/filter-sheet";
import { SortSelect } from "@/components/shop/sort-select";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import { Pagination } from "@/components/shop/pagination";
import { PageLoader } from "@/components/page-loader";
import { SearchCategoryChips } from "@/components/shop/search-category-chips";
import { searchCategoryHref } from "@/lib/search-url";

// Mobile Components
import { MobileSearchView } from "@/components/mobile/search/mobile-search-view";

interface SearchSwitcherProps {
  query: string;
  /** The shelf a category chip picked, from `?category=`. */
  category: string | null;
  result: CatalogResult;
  activeFilterCount: number;
  /** Active brands with published products, for the entry state's shortcuts. */
  brands: { slug: string; name: string; count: number }[];
  /** Only populated when the search found nothing. */
  closest: { items: CatalogResult["items"]; matchedOn: string[] };
}

export function SearchSwitcher({
  query,
  category,
  result,
  activeFilterCount,
  brands,
  closest,
}: SearchSwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);
  const searchParams = useSearchParams();
  const hrefFor = (slug: string | null) => searchCategoryHref(new URLSearchParams(searchParams.toString()), slug);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return (
      <MobileSearchView
        initialQuery={query}
        initialResult={result}
        category={category}
        brands={brands}
        closest={closest}
      />
    );
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
            {query ? <>Results for “{query}”</> : "Search"}
          </h1>
          <div className="mt-3 block lg:hidden">
            <SearchBox />
          </div>
          <p className="mt-1.5 text-sm font-medium text-ink-700">
            {result.total} {result.total === 1 ? "product" : "products"}
          </p>
          {query ? (
            <SearchCategoryChips
              categories={result.facets.categories}
              selected={category}
              hrefFor={hrefFor}
              className="mt-4"
            />
          ) : null}
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

        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

