"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Mic,
  Scan,
  X,
  History,
  SlidersHorizontal,
  Loader2,
  AlertCircle,
  Volume2,
  Maximize,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerHaptic } from "@/lib/native/haptics";
import type { CatalogResult } from "@/lib/services/catalog";
import type { SearchSuggestions } from "@/lib/services/search";
import { MobileProductCard } from "../home/mobile-product-card";
import { SearchCategoryChips } from "@/components/shop/search-category-chips";
import { searchCategoryHref } from "@/lib/search-url";
import { BottomSheetLayout } from "../bottom-sheet-layout";
import { formatPaise } from "@/lib/money";
import { PRICE_ON_REQUEST_LABEL } from "@/lib/catalog-visibility";

interface MobileSearchViewProps {
  initialQuery: string;
  initialResult: CatalogResult;
  /** The shelf a category chip picked (`?category=`), or null. */
  category?: string | null;
  /** Active brands that have something published behind them. */
  brands: { slug: string; name: string; count: number }[];
  /** Products matching part of the query, when the query itself found nothing. */
  closest: { items: CatalogResult["items"]; matchedOn: string[] };
}

export function MobileSearchView({
  initialQuery,
  initialResult,
  category = null,
  brands,
  closest,
}: MobileSearchViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search input and state
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searching, startSearching] = useTransition();

  // Dialog/Modal states
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [voicePulse, setVoicePulse] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  
  // Filter bottom sheet state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sort, setSort] = useState(
    /* "Popularity" sorted by a rating count nothing writes (ISS-034), so it
       was newest-first presented as a ranking — desktop dropped it (sort-select).
       Old ?sort=popular links still work and land on newest. */
    !searchParams.get("sort") || searchParams.get("sort") === "popular" ? "newest" : (searchParams.get("sort") as string)
  );
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    searchParams.getAll("brand").flatMap(b => b.split(","))
  );
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");
  const [inStockOnly, setInStockOnly] = useState(false); // client-side filter

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent searches on client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ve_recent_searches");
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch {}
  }, []);

  // Fetch search suggestions debounced
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions(null);
      setLoadingSuggestions(false);
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    setLoadingSuggestions(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
        }
      } catch {} finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const saveRecentSearch = (searchTerm: string) => {
    const term = searchTerm.trim();
    if (!term) return;
    setRecentSearches(prev => {
      const next = [term, ...prev.filter(x => x !== term)].slice(0, 8);
      localStorage.setItem("ve_recent_searches", JSON.stringify(next));
      return next;
    });
  };

  const handleSearchSubmit = (searchTerm: string) => {
    const term = searchTerm.trim();
    saveRecentSearch(term);
    setShowSuggestions(false);
    triggerHaptic("medium");

    startSearching(() => {
      // Build search params
      const params = new URLSearchParams();
      params.set("q", term);
      if (sort !== "newest") params.set("sort", sort);
      if (selectedBrands.length) params.set("brand", selectedBrands.join(","));
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      router.push(`/search?${params.toString()}`);
    });
  };

  const clearRecentSearches = () => {
    triggerHaptic("light");
    localStorage.removeItem("ve_recent_searches");
    setRecentSearches([]);
  };

  // voice search native trigger
  const triggerVoiceSearch = async () => {
    setVoiceError(null);
    triggerHaptic("medium");
    setIsVoiceOpen(true);
    setVoicePulse(true);

    try {
      const { startListening, checkSpeechPermission } = await import("@/lib/native/speech");
      const hasPerm = await checkSpeechPermission();
      if (!hasPerm) {
        setVoiceError("Microphone permission denied.");
        setVoicePulse(false);
        return;
      }

      await startListening((resultText: string) => {
        setVoicePulse(false);
        setIsVoiceOpen(false);
        if (resultText) {
          setQuery(resultText);
          handleSearchSubmit(resultText);
        }
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setVoicePulse(false);
      setVoiceError(err.message || "Speech input failed. Please type your query.");
    }
  };

  const handleCloseVoice = async () => {
    try {
      const { stopListening } = await import("@/lib/native/speech");
      await stopListening();
    } catch {}
    setIsVoiceOpen(false);
    setVoicePulse(false);
  };

  // barcode scanner native trigger
  const triggerBarcodeScan = async () => {
    setScanError(null);
    triggerHaptic("medium");
    setIsScanOpen(true);

    try {
      const { startBarcodeScan, checkScannerPermission } = await import("@/lib/native/scanner");
      const hasPerm = await checkScannerPermission();
      if (!hasPerm) {
        setScanError("Camera permission denied.");
        return;
      }

      const result = await startBarcodeScan();
      setIsScanOpen(false);
      if (result && result.content) {
        setQuery(result.content);
        handleSearchSubmit(result.content);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setIsScanOpen(false);
      alert(err.message || "Failed to start camera scan.");
    }
  };

  const handleCloseScan = async () => {
    try {
      const { stopBarcodeScan } = await import("@/lib/native/scanner");
      await stopBarcodeScan();
    } catch {}
    setIsScanOpen(false);
  };

  // filter bottom sheet handlers
  const handleBrandToggle = (brandSlug: string) => {
    triggerHaptic("light");
    setSelectedBrands(prev =>
      prev.includes(brandSlug)
        ? prev.filter(b => b !== brandSlug)
        : [...prev, brandSlug]
    );
  };

  const applyFilters = () => {
    triggerHaptic("medium");
    setIsFilterOpen(false);
    
    startSearching(() => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (sort !== "newest") params.set("sort", sort);
      if (selectedBrands.length) params.set("brand", selectedBrands.join(","));
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      /* Filters narrow the picked shelf, not replace it. A new query (above)
         does drop it — shelves belong to a query, as in the app. */
      if (category) params.set("category", category);
      router.push(`/search?${params.toString()}`);
    });
  };

  const resetFilters = () => {
    triggerHaptic("light");
    setSort("newest");
    setSelectedBrands([]);
    setMinPrice("");
    setMaxPrice("");
    setInStockOnly(false);
  };

  // Local client-side availability filter
  const displayedItems = initialResult.items.filter(item => {
    if (inStockOnly && !item.inStock) return false;
    return true;
  });

  const resultCount = inStockOnly ? displayedItems.length : initialResult.total;

  const activeFilterCount =
    selectedBrands.length +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (inStockOnly ? 1 : 0);

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-24 overflow-x-hidden">
      {/* The page's heading, for screen readers — the query is already visible
          in the search box, so it is not repeated on screen. Same wording as
          the desktop layout's visible h1. */}
      <h1 className="sr-only">{initialQuery ? <>Results for “{initialQuery}”</> : "Search"}</h1>
      {/* Search Header */}
      <div className="native-header sticky top-0 z-30 flex items-center gap-2 border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        {initialQuery && (
          <button
            onClick={() => {
              triggerHaptic("light");
              router.push("/search");
              setQuery("");
            }}
            aria-label="Back"
            className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
          >
            <ArrowLeft className="size-4.5" />
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearchSubmit(query);
          }}
          className="flex-1 flex items-center rounded-2xl border border-mist/40 bg-white px-3 py-2 focus-within:border-brand-deep"
        >
          <Search className="size-4.5 text-brand-deep mr-2" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search cement, tools, paint..."
            aria-label="Search products"
            className="w-full bg-transparent py-1 text-xs font-semibold text-ink outline-none placeholder:text-ink/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                setQuery("");
                setSuggestions(null);
              }}
              aria-label="Clear search"
              className="text-ink/40 p-1"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={triggerVoiceSearch}
            className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
            title="Voice Search"
          >
            <Mic className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={triggerBarcodeScan}
            className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
            title="Barcode Scanner"
          >
            <Scan className="size-4.5" />
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col">
        {searching && (
          <div className="flex-1 flex items-center justify-center p-12">
            <Loader2 className="size-8 animate-spin text-brand-deep" />
          </div>
        )}

        {!searching && (
          <>
            {/* suggestions list */}
            {showSuggestions && query.trim().length >= 2 && (
              <div className="flex-1 bg-white">
                {loadingSuggestions && (
                  <div className="flex items-center justify-center p-6 gap-2">
                    <Loader2 className="size-4 animate-spin text-brand-deep" />
                    <span className="text-xs font-semibold text-ink/50">Fetching suggestions...</span>
                  </div>
                )}

                {!loadingSuggestions && suggestions && (
                  <div className="p-4 space-y-5">
                    {/* categories suggestions */}
                    {suggestions.categories.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
                          Matching Categories
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {suggestions.categories.map((c) => (
                            <Link
                              key={c.slug}
                              href={`/category/${c.slug}`}
                              onClick={() => {
                                triggerHaptic("light");
                                saveRecentSearch(c.name);
                              }}
                              className="rounded-full border border-mist/30 bg-surface px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-deep"
                            >
                              {c.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* brands suggestions */}
                    {suggestions.brands.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
                          Matching Brands
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {suggestions.brands.map((b) => (
                            <button
                              key={b.slug}
                              onClick={() => {
                                handleBrandToggle(b.slug);
                                handleSearchSubmit(query);
                              }}
                              className="rounded-full border border-mist/30 bg-surface px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-deep"
                            >
                              {b.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* product suggestions */}
                    {suggestions.products.length > 0 && (
                      <div>
                        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
                          Suggested Products
                        </h3>
                        <div className="space-y-3">
                          {suggestions.products.map((p) => (
                            <Link
                              key={p.slug}
                              href={`/product/${p.slug}`}
                              onClick={() => {
                                triggerHaptic("light");
                                saveRecentSearch(p.title);
                              }}
                              className="flex items-center gap-3 border-b border-mist/10 pb-2.5"
                            >
                              <div className="relative size-10 overflow-hidden rounded-lg bg-surface border border-mist/20">
                                {p.imageUrl ? (
                                  <Image
                                    src={p.imageUrl}
                                    alt={p.title}
                                    fill
                                    className="object-contain p-1"
                                    sizes="40px"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-[8px] text-ink/30">VE</div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="truncate text-xs font-bold text-ink leading-tight">{p.title}</h4>
                                <p className="text-[9px] text-ink/50 mt-0.5 leading-none">
                                  {p.brandName} • {p.pricePaise == null ? PRICE_ON_REQUEST_LABEL : formatPaise(p.pricePaise)}
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/*
                      The empty state from artboard 15c.

                      A search that finds nothing is the moment a customer
                      decides whether this shop is worth coming back to. The
                      previous version — one grey line reading "No suggestions
                      found" — treated it as a null result. The artboard treats
                      it as a conversation: here is why we do not have it, here
                      is what we do have, and tell us if we should stock it.

                      What is honest to say here: we stock a fixed set of
                      categories and this is not in them. What is not built is
                      "Request this item" — there is no model to record a
                      request against, and a button that swallows the request
                      silently is worse than not offering it. So the screen
                      routes to the catalogue instead.
                    */}
                    {suggestions.products.length === 0 &&
                      suggestions.categories.length === 0 &&
                      suggestions.brands.length === 0 && (
                        <div className="py-6 text-center">
                          <p className="text-[17px] font-extrabold leading-[21px] tracking-[-0.02em] text-ink">
                            <span className="font-light text-ink-500">Nothing matches</span>
                            <br />
                            that yet.
                          </p>
                          <p className="mx-auto mt-2.5 max-w-[280px] text-[12px] font-medium leading-[17px] text-ink-700">
                            We stock a fixed range in Srinagar and this is not in it yet.
                          </p>
                          <Link
                            href="/categories"
                            onClick={() => triggerHaptic("light")}
                            className="mt-4 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[13px] font-bold text-white no-underline"
                          >
                            Browse what we stock
                          </Link>
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* idle search view */}
            {!showSuggestions && !initialQuery && (
              <div className="p-4 space-y-6 flex-1 bg-white">
                {/* recent searches */}
                {recentSearches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40">
                        Recent Searches
                      </h3>
                      <button
                        onClick={clearRecentSearches}
                        className="text-[10px] font-bold text-danger hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="space-y-1">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          onClick={() => {
                            setQuery(term);
                            handleSearchSubmit(term);
                          }}
                          className="flex w-full items-center gap-3 py-3 border-b border-mist/10 text-xs font-semibold text-ink hover:text-brand-deep text-left"
                        >
                          <History className="size-4 text-ink/30" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/*
                  "Jump to a brand" — artboard 15b.

                  This replaced a hardcoded list of five terms under the heading
                  "Popular Searches". Nothing logs a search (ISS-060), so that
                  heading was a claim about customer behaviour nobody had
                  measured — the same fabrication as the invented search terms
                  that were on the reporting screen, pointed at customers
                  instead of at us.

                  Brands are real, and a better shortcut anyway: a contractor
                  looking for Havells wire knows the brand before the category.
                  Only brands with something published behind them are offered,
                  because a chip that lands on an empty results page reads as
                  "you stock this" and then proves otherwise.

                  What is still missing is the artboard's "Searched most in
                  Srinagar". That needs the query log. It is absent rather than
                  approximated.
                */}
                {brands.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-3">
                      Jump to a brand
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {brands.map((b) => (
                        <Link
                          key={b.slug}
                          href={`/search?brand=${encodeURIComponent(b.slug)}`}
                          onClick={() => triggerHaptic("light")}
                          className="flex items-center gap-1.5 rounded-full border border-mist/35 bg-surface px-4 py-2 text-xs font-bold text-ink no-underline hover:border-brand-deep active:scale-95"
                        >
                          {b.name}
                          <span className="text-[10px] font-semibold text-ink/40">{b.count}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* results view */}
            {!showSuggestions && initialQuery && (
              <div className="flex-1 flex flex-col">
                <SearchCategoryChips
                  categories={initialResult.facets.categories}
                  selected={category}
                  hrefFor={(slug) => searchCategoryHref(new URLSearchParams(searchParams.toString()), slug)}
                  className="border-b border-mist/10 bg-white px-4 py-3"
                />
                {/* Toolbar */}
                <div className="flex items-center justify-between border-b border-mist/10 bg-white px-4 py-2.5">
                  <span className="text-xs font-extrabold text-ink/60 uppercase">
                    {/* The server's total, so it agrees with the category chip that
                        led here; only the local in-stock switch counts the page. */}
                    {resultCount} {resultCount === 1 ? "Result" : "Results"}
                  </span>
                  <button
                    onClick={() => {
                      triggerHaptic("light");
                      setIsFilterOpen(true);
                    }}
                    className="flex items-center gap-1 rounded-full border border-mist/30 bg-surface px-3 py-1.5 text-xs font-bold text-brand-deep shadow-xs active:scale-95"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                  </button>
                </div>

                {/* product grid */}
                {displayedItems.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 p-4 bg-surface-container-low/20">
                    {displayedItems.map((item) => (
                      <MobileProductCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  /*
                    "Closest things we do stock" — artboard 15c.

                    Closeness is literal, not a euphemism for popular. The query
                    is split into words and each tried on its own, so
                    "waterproof cement paint" finds nothing as a phrase but
                    "cement" and "paint" both land on real shelves. The heading
                    names the word that matched, so the customer can see why
                    these are being offered rather than wondering what the shop
                    thinks they asked for.

                    When every word misses, nothing is shown. Filling the space
                    with an unrelated best-seller under the words "closest
                    things we stock" would be a small lie that wastes the time
                    of somebody standing on a site.
                  */
                  <div className="flex-1 bg-white p-6">
                    <div className="text-center">
                      <AlertCircle className="mx-auto size-10 text-ink/30 mb-3" />
                      <h3 className="text-sm font-extrabold text-ink">
                        Nothing matches &ldquo;{initialQuery}&rdquo;
                      </h3>
                      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink/50">
                        We stock a fixed range in Srinagar. Check the spelling, or try a
                        broader word.
                      </p>
                    </div>

                    {closest.items.length > 0 ? (
                      <div className="mt-7">
                        <h4 className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-ink/40">
                          Closest things we do stock
                          {closest.matchedOn.length > 0 && (
                            <span className="ml-1.5 normal-case tracking-normal text-ink/30">
                              matched on {closest.matchedOn.map((w) => `“${w}”`).join(", ")}
                            </span>
                          )}
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          {closest.items.map((item) => (
                            <MobileProductCard key={item.id} item={item} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-7 text-center">
                        <p className="mx-auto max-w-[280px] text-[12px] font-medium leading-[17px] text-ink-700">
                          Nothing close either — no part of that matches anything we
                          carry.
                        </p>
                        <Link
                          href="/categories"
                          onClick={() => triggerHaptic("light")}
                          className="mt-4 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[13px] font-bold text-white no-underline"
                        >
                          Browse what we stock
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Voice Search Modal */}
      <AnimatePresence>
        {isVoiceOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand-deep text-white p-6"
          >
            <div className="absolute top-[calc(env(safe-area-inset-top,12px)+12px)] right-4">
              <button
                onClick={handleCloseVoice}
                className="size-10 flex items-center justify-center rounded-full bg-white/10"
              >
                <X className="size-5" />
              </button>
            </div>

            <motion.div
              animate={{ scale: voicePulse ? [1, 1.15, 1] : 1 }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="flex size-24 items-center justify-center rounded-full bg-white/10 mb-8"
            >
              <Mic className="size-12 text-white" />
            </motion.div>
            
            <h2 className="text-xl font-extrabold text-center">
              {voiceError ? "Failed" : "Listening..."}
            </h2>
            <p className="mt-2 text-sm text-white/60 text-center max-w-xs">
              {voiceError ?? "Say \"Cement\", \"Waterproofing\", or \"Brush\" to search."}
            </p>
            {!voiceError && (
              <div className="mt-8 flex items-center gap-1.5">
                <Volume2 className="size-4 animate-bounce" />
                <span className="text-xs font-semibold text-white/50">Processing audio waveform</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barcode Scanner Modal */}
      <AnimatePresence>
        {isScanOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-between bg-black/90 text-white p-6"
          >
            <div className="flex items-center justify-between pt-[env(safe-area-inset-top,12px)]">
              <button
                onClick={handleCloseScan}
                className="size-10 flex items-center justify-center rounded-full bg-white/10"
              >
                <ArrowLeft className="size-5" />
              </button>
              <h2 className="text-sm font-bold uppercase tracking-wider">Barcode Scanner</h2>
              <div className="size-10" />
            </div>

            <div className="relative mx-auto size-64 rounded-3xl border-2 border-dashed border-white/40 flex items-center justify-center bg-black/40 shadow-inner">
              <div className="absolute inset-x-4 h-0.5 bg-danger animate-pulse" style={{
                top: "45%",
                boxShadow: "0 0 8px rgba(220,38,38,0.8)"
              }} />
              <Maximize className="size-48 text-white/10" strokeWidth={0.5} />
            </div>

            <div className="pb-12 text-center">
              <p className="text-sm font-bold">{scanError ?? "Align barcode within frame"}</p>
              <p className="text-xs text-white/40 mt-1 max-w-xs mx-auto">
                Scan UPC code to find matches automatically.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Bottom Sheet */}
      <BottomSheetLayout
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Sort & Filter Products"
      >
        <div className="space-y-5 pb-6">
          {/* Sorting */}
          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
              Sort By
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "newest", label: "Newest Arrivals" },
                { id: "price_asc", label: "Price: Low to High" },
                { id: "price_desc", label: "Price: High to Low" },
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
