"use client";

import React, { useEffect, useState } from "react";
import type { CatalogResult } from "@/lib/services/catalog";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return <MobileSearchView initialQuery={query} initialResult={result} />;
  }

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {query ? <>Results for “{query}”</> : "Search"}
          </h1>
          <div className="mt-3 block lg:hidden">
            <SearchBox />
          </div>
          <p className="mt-1.5 text-sm font-semibold text-neutral-500">
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
