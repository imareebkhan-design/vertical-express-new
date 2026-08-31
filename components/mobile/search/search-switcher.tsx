"use client";

import React from "react";
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

// Mobile Components
import { MobileSearchView } from "@/components/mobile/search/mobile-search-view";

interface SearchSwitcherProps {
  query: string;
  result: CatalogResult;
  activeFilterCount: number;
}

export function SearchSwitcher({ query, result, activeFilterCount }: SearchSwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileSearchView initialQuery={query} initialResult={result} />;
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

