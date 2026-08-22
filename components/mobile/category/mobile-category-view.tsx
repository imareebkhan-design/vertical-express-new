"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw, SlidersHorizontal, Loader2, AlertCircle, Check } from "lucide-react";
import type { Category } from "@/prisma/generated/client";
import type { CatalogResult, CatalogItem, CatalogSort } from "@/lib/services/catalog";
import { fetchProductsAction } from "@/actions/catalog";
import { MobileProductCard } from "../home/mobile-product-card";
import { BottomSheetLayout } from "../bottom-sheet-layout";
import { triggerHaptic } from "@/lib/native/haptics";
import { rupeesToPaise } from "@/lib/money";

interface MobileCategoryViewProps {
  category: Category;
  slug: string;
  initialResult: CatalogResult;
}

export function MobileCategoryView({ category, slug, initialResult }: MobileCategoryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Feed states
  const [products, setProducts] = useState<CatalogItem[]>(initialResult.items);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialResult.items.length < initialResult.total);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Pull to refresh gesture states
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);

  // Filters state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sort, setSort] = useState(searchParams.get("sort") || "popular");
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    searchParams.getAll("brand").flatMap((b) => b.split(",")).filter(Boolean)
  );
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");
  const [inStockOnly, setInStockOnly] = useState(false); // client-side stock availability toggle

  const observerTarget = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  // Reset list when url search filters or base query changes
  useEffect(() => {
    setProducts(initialResult.items);
    setPage(1);
    setHasMore(initialResult.items.length < initialResult.total);
    setLoadingMore(false);
  }, [initialResult]);

  // Load more pages for infinite scroll
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const activeBrands = selectedBrands.filter(Boolean);
      const nextResult = await fetchProductsAction({
        categorySlug: slug,
        page: page + 1,
        sort: sort as CatalogSort,
        brandSlugs: activeBrands.length ? activeBrands : undefined,
        minPaise: minPrice ? rupeesToPaise(Number(minPrice)) : undefined,
        maxPaise: maxPrice ? rupeesToPaise(Number(maxPrice)) : undefined,
      });

      if (nextResult.items.length > 0) {
        setProducts((prev) => [...prev, ...nextResult.items]);
        setPage((p) => p + 1);
        setHasMore(products.length + nextResult.items.length < nextResult.total);
      } else {
        setHasMore(false);
      }
    } catch {} finally {
      setLoadingMore(false);
    }
  };

  // Setup intersection observer for scrolling load-trigger
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "150px" }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) observer.observe(currentTarget);

    return () => {
      if (currentTarget) observer.unobserve(currentTarget);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, page]);

  // Pull to refresh handlers
  const handleRefresh = () => {
    triggerHaptic("medium");
    setRefreshing(true);
    setPullY(0);

    startTransition(async () => {
      router.refresh();
      setTimeout(() => {
        setRefreshing(false);
        triggerHaptic("light");
      }, 1000);
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0) {
      setPullY(Math.min(diff * 0.4, 80));
    }
  };

  const handleTouchEnd = () => {
    setIsPulling(false);
    if (pullY > 55) {
      handleRefresh();
    } else {
      setPullY(0);
    }
  };

  // Apply filters by building query strings
  const applyFilters = () => {
    triggerHaptic("medium");
    setIsFilterOpen(false);

    startTransition(() => {
      const params = new URLSearchParams();
      if (sort !== "popular") params.set("sort", sort);
      if (selectedBrands.length) params.set("brand", selectedBrands.join(","));
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      router.push(`/category/${slug}?${params.toString()}`);
    });
  };

  const resetFilters = () => {
    triggerHaptic("light");
    setSort("popular");
    setSelectedBrands([]);
    setMinPrice("");
    setMaxPrice("");
    setInStockOnly(false);
  };

  const handleBrandToggle = (brandSlug: string) => {
    triggerHaptic("light");
    setSelectedBrands((prev) =>
      prev.includes(brandSlug)
        ? prev.filter((b) => b !== brandSlug)
        : [...prev, brandSlug]
    );
  };

  // Client-side availability filter
  const displayedProducts = products.filter((item) => {
    if (inStockOnly && !item.inStock) return false;
    return true;
  });

  const activeFilterCount =
    selectedBrands.length +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (inStockOnly ? 1 : 0);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex flex-col min-h-screen bg-surface pb-24 overflow-x-hidden"
    >
      {/* Pull-to-refresh spinner */}
      <div
        className="absolute left-0 right-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-150"
        style={{
          top: `${pullY - 44}px`,
          opacity: pullY > 15 ? 1 : 0,
        }}
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-white shadow-md text-brand-deep">
          <RefreshCw className={`size-4 ${refreshing || pullY > 55 ? "animate-spin text-brand" : ""}`} />
        </div>
      </div>

      {/* Sticky Native Header */}
      <div className="native-header sticky top-0 z-30 flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              triggerHaptic("light");
              router.push("/categories");
            }}
            className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
          >
            <ArrowLeft className="size-4.5" />
          </button>
          <div>
            <h1 className="text-base font-extrabold text-ink leading-none">{category.name}</h1>
            <p className="text-[10px] text-ink/40 font-semibold mt-1 block">
              {initialResult.total} {initialResult.total === 1 ? "item" : "items"} available
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className={`flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink transition-transform ${
            refreshing ? "animate-spin text-brand-deep" : ""
          }`}
          title="Refresh Feed"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* Sticky Filter / Toolbar Bar */}
      <div className="sticky top-[53px] z-20 flex items-center justify-between border-b border-mist/10 bg-white/95 px-4 py-2.5 shadow-xs">
        <span className="text-[10px] font-extrabold text-ink/50 uppercase tracking-wide">
          {displayedProducts.length} Showing
        </span>
        <button
          onClick={() => {
            triggerHaptic("light");
            setIsFilterOpen(true);
          }}
          className="flex items-center gap-1 rounded-full border border-mist/35 bg-surface px-3.5 py-1.5 text-xs font-bold text-brand-deep shadow-2xs active:scale-95"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </button>
      </div>

      {/* Products list grid */}
      <div className="flex-1">
        {displayedProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 p-4 bg-surface-container-low/20">
            {displayedProducts.map((item) => (
              <MobileProductCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="size-10 text-ink/20 mb-3" />
            <h2 className="text-sm font-extrabold text-ink">No Products Found</h2>
            <p className="mt-1 text-xs text-ink/40 max-w-xs mx-auto leading-relaxed">
              No items in {category.name} match your filters. Reset filters to see all supplies.
            </p>
          </div>
        )}

        {/* Scroll Sensor sentinel */}
        <div ref={observerTarget} className="h-10 w-full flex items-center justify-center">
          {loadingMore && <Loader2 className="size-5 animate-spin text-brand-deep" />}
        </div>
      </div>

      {/* Filter Bottom Sheet */}
      <BottomSheetLayout
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title={`${category.name} Filters`}
      >
        <div className="space-y-5 pb-6">
          {/* Sorting */}
          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
              Sort By
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "popular", label: "Popularity" },
                { id: "price_asc", label: "Price: Low to High" },
                { id: "price_desc", label: "Price: High to Low" },
                { id: "newest", label: "Newest Arrivals" },
                { id: "discount", label: "Highest Discount" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    triggerHaptic("light");
                    setSort(s.id);
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold text-center transition-all ${
                    sort === s.id
                      ? "border-brand-deep bg-brand-deep/5 text-brand-deep" :"border-mist/20 bg-surface text-ink/70"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Availability */}
          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
              Availability
            </h4>
            <button
              onClick={() => {
                triggerHaptic("light");
                setInStockOnly(!inStockOnly);
              }}
              className={`flex items-center justify-between w-full rounded-2xl border p-3.5 text-left text-xs font-bold transition-all ${
                inStockOnly
                  ? "border-brand-deep bg-brand-deep/5 text-brand-deep" :"border-mist/20 bg-surface text-ink/70"
              }`}
            >
              <span>Exclude Out of Stock (In Stock Only)</span>
              {inStockOnly && <Check className="size-4 text-brand-deep" />}
            </button>
          </div>

          {/* Brands */}
          {initialResult.facets.brands.length > 0 && (
            <div>
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
                Brands
              </h4>
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                {initialResult.facets.brands.map((b) => {
                  const isSelected = selectedBrands.includes(b.slug);
                  return (
                    <button
                      key={b.slug}
                      onClick={() => handleBrandToggle(b.slug)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                        isSelected
                          ? "border-brand-deep bg-brand-deep/5 text-brand-deep" :"border-mist/20 bg-surface text-ink/70"
                      }`}
                    >
                      {b.name} ({b.count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price Range */}
          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
              Price Range (₹)
            </h4>
            <div className="flex items-center gap-3">
              <input
                type="tel"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))}
                className="flex-1 rounded-xl border border-mist/20 bg-surface p-2.5 text-xs font-bold text-ink outline-none focus:border-brand-deep text-center"
              />
              <span className="text-xs text-ink/40 font-bold">to</span>
              <input
                type="tel"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
                className="flex-1 rounded-xl border border-mist/20 bg-surface p-2.5 text-xs font-bold text-ink outline-none focus:border-brand-deep text-center"
              />
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex gap-2 pt-4 border-t border-mist/10">
            <button
              onClick={resetFilters}
              className="flex-1 rounded-xl border border-mist/30 py-3.5 text-xs font-bold text-ink text-center active:bg-mist/10"
            >
              Reset All
            </button>
            <button
              onClick={applyFilters}
              className="flex-1 rounded-xl bg-brand-deep py-3.5 text-xs font-bold text-white text-center shadow-md active:scale-[0.98]"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </BottomSheetLayout>
    </div>
  );
}
