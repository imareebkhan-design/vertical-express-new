import Link from "next/link";
import { X } from "lucide-react";
import { categoryChips, type CategoryFacet } from "@/lib/search-url";

interface SearchCategoryChipsProps {
  categories: CategoryFacet[] | undefined;
  /** The `category` in the URL, if any. */
  selected: string | null;
  /** Where a chip goes: the category's scoped search, or (null) the unscoped one. */
  hrefFor: (categorySlug: string | null) => string;
  className?: string;
}

/**
 * "In: Cement 23 · Adhesives 6" — the search artboard's category row (W-17).
 *
 * Plain links over `?category=`, so the choice is in the URL: back undoes it,
 * a reload keeps it, and the result is shareable. The picked shelf shows alone
 * with a clear control, as in the app — the counts are measured within the
 * current filters, so the other shelves have no honest count while one is picked.
 */
export function SearchCategoryChips({ categories, selected, hrefFor, className }: SearchCategoryChipsProps) {
  const chips = categoryChips(categories, selected);
  if (chips.length === 0) {
    /* A category in the URL that matches nothing (a stale link, or a filter
       that emptied it) still needs a way out. */
    return selected ? (
      <p className={className}>
        <Link href={hrefFor(null)} className="text-sm font-bold text-ink underline">
          Show all categories
        </Link>
      </p>
    ) : null;
  }

  return (
    <nav aria-label="Search within a category" className={className}>
      <ul className="flex flex-wrap items-center gap-2">
        <li className="text-xs font-extrabold uppercase tracking-widest text-ink-500">In:</li>
        {chips.map((c) => {
          const on = c.slug === selected;
          return (
            <li key={c.slug}>
              <Link
                href={hrefFor(on ? null : c.slug)}
                aria-current={on ? "true" : undefined}
                aria-label={on ? `${c.name}, ${c.count} results — clear category` : `${c.name}, ${c.count} results`}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold no-underline transition-colors ${
                  on ? "bg-ink text-white" : "bg-paper text-ink shadow-card hover:bg-hush"
                }`}
              >
                {c.name}
                <span className={`tabular-nums ${on ? "text-white/70" : "text-ink-500"}`}>{c.count}</span>
                {on ? <X className="size-3.5" aria-hidden /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
