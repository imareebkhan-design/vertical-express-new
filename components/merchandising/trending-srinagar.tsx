"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TRENDING } from "@/lib/merchandising/home";
import { MerchPicture } from "./merch-picture";

/**
 * "Trending in Srinagar" — curated, and labelled as curated.
 *
 * There is no ranking data behind it yet (`TRENDING.source` is "curated"): the
 * picks are chosen by hand and nothing on screen claims a rank or a sales
 * figure. Each
 * card links only to categories the catalogue actually has open (the config's
 * short labels keep the cards even); a pick left with none is not shown.
 *
 * Phone: a horizontal, snap-scrolling row. Desktop: a four-column grid.
 */
export function TrendingSrinagar({
  categoryNames,
  compact = false,
}: {
  /** Active category slug → its name in the catalogue. */
  categoryNames: Record<string, string>;
  compact?: boolean;
}) {
  const picks = TRENDING.picks
    .map((p) => ({
      ...p,
      categories: p.categories
        .filter((c) => c.slug in categoryNames),
    }))
    .filter((p) => p.categories.length > 0);
  if (picks.length === 0) return null;

  return (
    <section
      aria-labelledby="trending-srinagar"
      className={compact ? "ve-reveal pt-6" : "ve-reveal mx-auto max-w-[1200px] px-6 pt-14"}
    >
      <h2
        id="trending-srinagar"
        className={
          compact
            ? "px-4 text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink"
            : "text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]"
        }
      >
        {TRENDING.title}
      </h2>

      <ul
        className={
          compact
            ? "ve-snap-row mt-3 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-1"
            : "mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4"
        }
      >
        {picks.map((p, i) => {
          const main = p.categories[0];
          return (
            <li
              key={p.id}
              className={`ve-trend-card ${compact ? "w-[74%] flex-none snap-start" : ""}`}
              style={{ "--ve-i": i } as CSSProperties}
            >
              <Link href={`/category/${main.slug}`} className="ve-trend-media" aria-label={`${p.title}: shop ${main.label}`}>
                <MerchPicture image={p.image} sizes={compact ? "74vw" : "(max-width: 1023px) 50vw, 285px"} />
              </Link>
              <div className="flex flex-1 flex-col p-3.5">
                <h3 className="text-[15px] font-bold leading-5 tracking-[-0.015em] text-ink">
                  <Link href={`/category/${main.slug}`} className="no-underline hover:text-brand-deep">
                    {p.title}
                  </Link>
                </h3>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-2.5">
                  {/* At most two, so every card is the same height. */}
                  {p.categories.slice(0, 2).map((c) => (
                    <Link
                      key={c.slug}
                      href={`/category/${c.slug}`}
                      className="inline-flex min-h-8 items-center gap-0.5 rounded-full bg-chip px-3 text-[11.5px] font-bold text-ink no-underline transition-colors hover:bg-hush"
                    >
                      {c.label}
                      <ChevronRight className="size-3" aria-hidden />
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
