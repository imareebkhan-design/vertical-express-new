"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { formatPaise } from "@/lib/money";
import type { SearchSuggestions } from "@/lib/services/search";
import { cn } from "@/lib/utils";

const EMPTY: SearchSuggestions = { products: [], categories: [], brands: [] };

/** Navbar typeahead search with debounced suggestions and a results-page submit. */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestions>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions(EMPTY);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setSuggestions(await res.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setOpen(false);
    }
  };

  const hasResults =
    suggestions.products.length > 0 ||
    suggestions.categories.length > 0 ||
    suggestions.brands.length > 0;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <form role="search" onSubmit={submit}>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search cement, wires, hinges, paint…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="h-11 w-full rounded-full border border-neutral-200 bg-surface pl-11 pr-4 text-sm transition-all duration-200 placeholder:text-neutral-400 focus:border-brand focus:bg-white focus:shadow-card focus:outline-none"
          aria-label="Search products"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-neutral-400" />
        )}
      </form>

      {open && query.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card-hover">
          {!hasResults && !loading && (
            <p className="px-4 py-6 text-center text-sm font-semibold text-neutral-500">
              No matches for “{query}”. Press Enter to search anyway.
            </p>
          )}

          {suggestions.categories.length > 0 && (
            <div className="border-b border-neutral-100 p-2">
              <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">
                Categories
              </p>
              {suggestions.categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-2 text-sm font-bold text-neutral-700 hover:bg-surface"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {suggestions.products.length > 0 && (
            <div className="p-2">
              <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">
                Products
              </p>
              {suggestions.products.map((p) => (
                <Link
                  key={p.slug}
                  href={`/product/${p.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface"
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-tile">
                    {p.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="size-full object-contain p-1" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{p.title}</span>
                    <span className="block text-xs font-semibold text-neutral-400">{p.brandName}</span>
                  </span>
                  <span className="text-sm font-extrabold">{formatPaise(p.pricePaise)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
