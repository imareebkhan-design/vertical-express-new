"use client";

import React from "react";
import type { Category } from "@/prisma/generated/client/client";
import type { CatalogResult } from "@/lib/services/catalog";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import { SortSelect } from "@/components/shop/sort-select";
import { Pagination } from "@/components/shop/pagination";
import { EmptyState } from "@/components/shop/empty-state";
import { FilterSidebar } from "@/components/shop/filter-sidebar";
import { CategoryBanner, ShopByAttribute } from "@/components/shop/category-banner";
import { BrandStrip } from "@/components/shop/brand-strip";
import { MostOrdered } from "@/components/shop/most-ordered";
import type { CatalogItem } from "@/lib/services/catalog";
import { FilterSheet } from "@/components/shop/filter-sheet";
import { PageLoader } from "@/components/page-loader";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { CategoryComingSoon } from "@/components/shop/category-coming-soon";
import type { DirectoryEntry } from "@/lib/category-directory";
import Link from "next/link";

// Mobile Components
import { MobileCategoryView } from "@/components/mobile/category/mobile-category-view";

type CategorySwitcherProps =
  | {
      category: Category;
      slug: string;
      result: CatalogResult;
      /** Ranked by units actually ordered — empty until something has been. */
      mostOrdered: CatalogItem[];
      /** Brands with a published product in this category, most-stocked first. */
      brands: { slug: string; name: string; count: number }[];
      activeFilterCount: number;
      comingSoon?: undefined;
    }
  | {
      category: Category;
      slug: string;
      /** A designated category with no visible product yet (lib/category-directory.ts). */
      comingSoon: { name: string; siblings: DirectoryEntry[] };
    };

export function CategorySwitcher(props: CategorySwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (props.comingSoon) {
    const { slug, comingSoon } = props;
    const panel = <CategoryComingSoon slug={slug} name={comingSoon.name} siblings={comingSoon.siblings} />;
    if (isMobile) {
      return (
        <div className="flex min-h-screen flex-col bg-canvas pb-24">
          <div className="sticky top-0 z-30 flex items-center gap-3 bg-canvas/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md">
            <Link
              href="/categories"
              aria-label="Back to categories"
              className="flex size-9 items-center justify-center rounded-full bg-paper text-ink no-underline shadow-card"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <h1 className="text-base font-extrabold leading-none text-ink">{comingSoon.name}</h1>
          </div>
          <div className="px-4 pt-6">{panel}</div>
        </div>
      );
    }
    return (
      <>
        <Navbar />
        <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-1.5 text-xs font-bold text-ink-500">
            <Link href="/" className="hover:text-ink">Home</Link>
            <ChevronRight className="size-3" aria-hidden />
            <Link href="/categories" className="hover:text-ink">Categories</Link>
            <ChevronRight className="size-3" aria-hidden />
            <span className="text-ink">{comingSoon.name}</span>
          </nav>
          <h1 className="sr-only">{comingSoon.name}</h1>
          {panel}
        </main>
        <Footer />
      </>
    );
  }

  const { category, slug, result, mostOrdered, brands, activeFilterCount } = props;

  if (isMobile) {
    return (
      <MobileCategoryView
        category={category}
        slug={slug}
        initialResult={result}
        mostOrdered={mostOrdered}
        brands={brands}
      />
    );
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
          total={result.total}
          slug={slug}
        />

        <ShopByAttribute facets={result.facets} slug={slug} />
        <BrandStrip slug={slug} brands={brands} />
        <MostOrdered categoryName={category.name} slug={slug} items={mostOrdered} />

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

      </main>
      <Footer />
    </>
  );
}
