"use client";

import React from "react";
import type { Category } from "@prisma/client";
import type { CatalogResult } from "@/lib/services/catalog";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import { SortSelect } from "@/components/shop/sort-select";
import { Pagination } from "@/components/shop/pagination";
import { EmptyState } from "@/components/shop/empty-state";
import { FilterSidebar } from "@/components/shop/filter-sidebar";
import { CategoryBanner, ShopByAttribute } from "@/components/shop/category-banner";
import { FilterSheet } from "@/components/shop/filter-sheet";
import { PageLoader } from "@/components/page-loader";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

// Mobile Components
import { MobileCategoryView } from "@/components/mobile/category/mobile-category-view";

interface CategorySwitcherProps {
  category: Category;
  slug: string;
  result: CatalogResult;
  activeFilterCount: number;
}

export function CategorySwitcher({ category, slug, result, activeFilterCount }: CategorySwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileCategoryView category={category} slug={slug} initialResult={result} />;
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Categories", item: "/categories" },
      { "@type": "ListItem", position: 3, name: category.name },
    ],
  };

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />

        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs font-bold text-ink-500">
          <Link href="/" className="hover:text-ink">Home</Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href="/categories" className="hover:text-ink">Categories</Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-ink">{category.name}</span>
        </nav>

        <CategoryBanner
          name={category.name}
          description={category.description}
          isBulk={category.isBulk}
          total={result.total}
          brandCount={result.facets.brands.length}
          slug={slug}
        />

        <ShopByAttribute facets={result.facets} slug={slug} />

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <div className="hidden lg:block">
            <FilterSidebar facets={result.facets} />
          </div>

          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <FilterSheet facets={result.facets} activeCount={activeFilterCount} />
              <SortSelect />
            </div>

            {result.items.length === 0 ? (
              <EmptyState
                title="No products match these filters"
                caption="Try removing a filter or browse everything in this category."
              />
            ) : (
              <>
                <CatalogGrid items={result.items} categorySlug={slug} />
                <Pagination page={result.page} perPage={result.perPage} total={result.total} />
              </>
            )}
          </div>
        </div>

        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}
