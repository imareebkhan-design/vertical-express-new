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
  Sparkles,
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
import { BottomSheetLayout } from "../bottom-sheet-layout";
import { formatPaise } from "@/lib/money";

interface MobileSearchViewProps {
  initialQuery: string;
  initialResult: CatalogResult;
}

const POPULAR_SEARCHES = ["Cement", "Adhesives", "Waterproofing", "Tools", "Paint"];

export function MobileSearchView({ initialQuery, initialResult }: MobileSearchViewProps) {
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
  const [sort, setSort] = useState(searchParams.get("sort") || "popular");
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
      if (sort !== "popular") params.set("sort", sort);
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
      if (sort !== "popular") params.set("sort", sort);
      if (selectedBrands.length) params.set("brand", selectedBrands.join(","));
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      router.push(`/search?${params.toString()}`);
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

  // Local client-side availability filter
  const displayedItems = initialResult.items.filter(item => {
    if (inStockOnly && !item.inStock) return false;
    return true;
  });

  const activeFilterCount =
    selectedBrands.length +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (inStockOnly ? 1 : 0);

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-24 overflow-x-hidden">
      {/* Search Header */}
      <div className="native-header sticky top-0 z-30 flex items-center gap-2 border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        {initialQuery && (
          <button
            onClick={() => {
              triggerHaptic("light");
              router.push("/search");
              setQuery("");
            }}
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
            className="w-full bg-transparent text-xs font-semibold text-ink outline-none placeholder:text-ink/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                setQuery("");
                setSuggestions(null);
              }}
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
                                  {p.brandName} • {formatPaise(p.pricePaise)}
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {suggestions.products.length === 0 &&
                      suggestions.categories.length === 0 &&
                      suggestions.brands.length === 0 && (
                        <div className="text-center py-6 text-xs text-ink/40 font-semibold">
                          No suggestions found. Press search to scan all products.
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

                {/* popular searches */}
                <div>
                  <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-3">
                    Popular Searches
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_SEARCHES.map((term) => (
                      <button
                        key={term}
                        onClick={() => {
                          setQuery(term);
                          handleSearchSubmit(term);
                        }}
                        className="flex items-center gap-1.5 rounded-full border border-mist/35 bg-surface px-4 py-2 text-xs font-bold text-ink hover:border-brand-deep active:scale-95"
                      >
                        <Sparkles className="size-3 text-brand-deep" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* results view */}
            {!showSuggestions && initialQuery && (
              <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="flex items-center justify-between border-b border-mist/10 bg-white px-4 py-2.5">
                  <span className="text-xs font-extrabold text-ink/60 uppercase">
                    {displayedItems.length} {displayedItems.length === 1 ? "Result" : "Results"}
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
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
                    <AlertCircle className="size-10 text-ink/30 mb-3" />
                    <h3 className="text-sm font-extrabold text-ink">No Results Found</h3>
                    <p className="mt-1 text-xs text-ink/50 max-w-xs leading-relaxed">
                      We couldn&apos;t find any matches for &apos;{initialQuery}&apos;. Check for typos or try another search.
                    </p>
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
