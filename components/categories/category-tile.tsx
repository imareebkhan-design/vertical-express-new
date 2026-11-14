import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProductPanel } from "@/components/ui/product-panel";
import type { DirectoryEntry } from "@/lib/category-directory";

/**
 * One category, as a picture and a name — the same tile on the home page and
 * both category indexes, so a department reads identically wherever it is met.
 *
 * A coming-soon category keeps its picture (it is the shop's structure, owner
 * 12 Oct 2026) under a quiet "Coming soon" label, and still links to its page,
 * which explains. It never shows a count, price or stock line.
 */
export function CategoryTile({
  entry,
  label = "short",
  className,
}: {
  entry: DirectoryEntry;
  /** "short" for dense grids, "full" where there is room. */
  label?: "short" | "full";
  className?: string;
}) {
  const soon = entry.state === "coming_soon";
  const text = label === "full" ? entry.name : entry.shortName;
  return (
    <Link
      href={`/category/${entry.slug}`}
      aria-label={soon ? `${entry.name}, coming soon` : entry.name}
      data-state={entry.state}
      className={cn(
        "group flex flex-col items-center rounded-[20px] no-underline outline-offset-4 focus-visible:outline-2 focus-visible:outline-ink",
        className
      )}
    >
      <span className="relative block w-full">
        <ProductPanel
          use="category"
          categorySlug={entry.slug}
          label={entry.name}
          className={cn(
            "ve-cat-tile aspect-square w-full rounded-[18px] transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
            soon && "opacity-75 saturate-[.6]"
          )}
          glyphClassName="size-1/2"
        />
        {soon ? (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-1.5 mx-auto w-max max-w-[96%] whitespace-nowrap rounded-full bg-paper/95 px-1.5 py-px text-[9.5px] font-bold leading-[14px] text-ink-700 shadow-card sm:bottom-2 sm:px-2 sm:text-[10.5px]"
          >
            Coming soon
          </span>
        ) : null}
      </span>
      <span aria-hidden className="mt-2 text-center text-[12.5px] font-semibold leading-4 text-ink">
        {text}
      </span>
    </Link>
  );
}
