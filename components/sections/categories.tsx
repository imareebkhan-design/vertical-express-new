"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TOTAL_CATEGORIES } from "@/components/ui/product-panel";

/**
 * A tile is a name, a slug and an icon. It used to carry its own product count
 * as a string — "23 products" under Cement, "148 products" under Tiling, "134
 * products" under Sanitary & bath — 879 across the twelve of them, against a
 * catalogue that holds 30 in those categories and 45 in total.
 *
 * It is the same claim as the "4,100 products" removed from the hero in
 * d86a85d, one component further down the same page, and it is the reason a
 * count does not belong in a component: nothing made it wrong, it was written
 * wrong and had no way of becoming right. The number now comes from the
 * database with the categories themselves.
 */
interface CategoryTile {
  name: string;
  slug: string;
  theme: "civil" | "elec" | "plumb" | "furn";
  iconSvg: React.ReactNode;
}

const CATEGORY_TILES: CategoryTile[] = [
  {
    name: "Cement",
    slug: "cement",
    theme: "civil",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M6 3h12l2 6v12H4V9z" />
        <path d="M10 3v6h4V3" />
      </svg>
    ),
  },
  {
    name: "Tiling",
    slug: "tiling",
    theme: "civil",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <rect x="13" y="13" width="8" height="8" rx="1" />
      </svg>
    ),
  },
  {
    name: "Painting",
    slug: "painting",
    theme: "civil",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7" />
        <path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    name: "Waterproofing",
    slug: "waterproofing",
    theme: "civil",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
      </svg>
    ),
  },
  {
    name: "Plywood & MDF",
    slug: "plywood-mdf-hdhmr",
    theme: "civil",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M3 7l9-4 9 4-9 4-9-4z" />
        <path d="M3 12l9 4 9-4" />
        <path d="M3 17l9 4 9-4" />
      </svg>
    ),
  },
  {
    name: "Adhesives",
    slug: "fevicol",
    theme: "civil",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M10 2v4h4V2" />
        <path d="M6 6h12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    name: "Wires & MCB",
    slug: "wires-mcb-distribution-boards",
    theme: "elec",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 9h6v6H9z" />
        <path d="M12 3v1" />
        <path d="M12 20v1" />
      </svg>
    ),
  },
  {
    name: "Switches",
    slug: "switches-sockets",
    theme: "elec",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    name: "Lighting",
    slug: "lighting",
    theme: "elec",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 5.5v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V14.5c1.5-1 3-3 3-5.5a7 7 0 0 0-7-7z" />
      </svg>
    ),
  },
  {
    name: "Ceiling fans",
    slug: "ceiling-fans-exhaust",
    theme: "elec",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 9c0-3.5 2-5 5-5s2 3.5 0 5-5 0-5 0z" />
        <path d="M9 12c-3.5 0-5-2-5-5s3.5-2 5 0 0 5 0 5z" />
        <path d="M12 15c0 3.5-2 5-5 5s-2-3.5 0-5 5 0 5 0z" />
        <path d="M15 12c3.5 0 5 2 5 5s-3.5 2-5 0 0-5 0-5z" />
      </svg>
    ),
  },
  {
    name: "CPVC & tanks",
    slug: "cpvc-pipes-overhead-tanks",
    theme: "plumb",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M4 6h16v12H4z" />
        <path d="M8 6v12" />
        <path d="M16 6v12" />
      </svg>
    ),
  },
  {
    name: "Sanitary & bath",
    slug: "sanitary-bath-fittings",
    theme: "plumb",
    iconSvg: (
      <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
        <path d="M4 12h16a1 1 0 0 1 1 1v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2a1 1 0 0 1 1-1z" />
        <path d="M6 12V5a2 2 0 0 1 2-2h1" />
      </svg>
    ),
  },
];

const THEME_BG = {
  civil: "var(--t-civil)",
  elec: "var(--t-elec)",
  plumb: "var(--t-plumb)",
  furn: "var(--t-furn)",
};

/** Published products per category slug, from `listCategories()`. */
export type CategoryCounts = Record<string, number>;

export function Categories({ counts }: { counts: CategoryCounts }) {
  return (
    <section id="categories" className="pt-16">
      <div className="mx-auto max-w-[1200px] px-6">
        {/* Section Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">
              Shop by category
            </h2>
            <p className="mt-1.5 text-[13.5px] font-medium text-ink-700">
              Four groups, {TOTAL_CATEGORIES} categories. Everything we hold in Srinagar.
            </p>
          </div>

          <Link
            href="/categories"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-paper px-4 text-[12.5px] font-bold text-ink shadow-card hover:bg-hush transition-colors shrink-0"
          >
            <span>All {TOTAL_CATEGORIES} categories</span>
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* 6-Column Grid of Category Tiles */}
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {CATEGORY_TILES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              className="group flex flex-col items-center no-underline"
            >
              <div
                className="flex h-[118px] w-full items-center justify-center rounded-[20px] text-ink-700 transition-transform duration-200 group-hover:scale-105"
                style={{ backgroundColor: THEME_BG[cat.theme] }}
              >
                {cat.iconSvg}
              </div>
              <span className="mt-2.5 text-center text-[13.5px] font-bold leading-[17px] text-ink group-hover:text-brand-deep transition-colors">
                {cat.name}
              </span>
              <span className="mt-0.5 text-center text-[11px] font-medium text-ink-500">
                {/* A category with nothing in it says so rather than "0 products",
                    which reads as a broken tile rather than an empty shelf. */}
                {counts[cat.slug] === undefined
                  ? "\u00a0"
                  : counts[cat.slug] === 0
                    ? "Nothing in stock"
                    : `${counts[cat.slug]} product${counts[cat.slug] === 1 ? "" : "s"}`}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

