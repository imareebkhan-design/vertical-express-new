"use client";

import React from "react";
import Link from "next/link";
import { Search, Bell, MapPin, ChevronDown } from "lucide-react";
import type { CatalogItem } from "@/lib/services/catalog";
import type { Category } from "@prisma/client";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { CategoryGlyph, type GlyphName } from "./category-glyph";
import { formatPaise } from "@/lib/money";

/**
 * The app home screen, built to the `HomeFirstRun` artboard.
 *
 * The design draws three home variants. `Main` (contractor) and `HomeHomeowner`
 * lead with an "Order again" rail, saved lists, and a "running low at this site"
 * rail inferred from past orders. None of those three features exist in the data
 * model yet — there is no saved-list entity, this view receives no order history,
 * and the consumption model behind "roughly 6 left" is explicitly unconfirmed in
 * the placeholder register. `HomeFirstRun` is the design's own answer for a user
 * with no history, so it is the variant that can be rendered honestly today.
 *
 * Everything on screen comes from real catalog data or from fixed copy in the
 * artboard. No price, delivery time or stock figure is invented here.
 */

/** The eight entry categories the artboard leads with, and their group tint. */
const ENTRY_CATEGORIES: {
  label: string;
  slug: string;
  glyph: GlyphName;
  tint: string;
}[] = [
  { label: "Cement", slug: "cement", glyph: "bag", tint: "var(--color-tint-civil)" },
  { label: "Tiling", slug: "tiling", glyph: "tile", tint: "var(--color-tint-civil)" },
  { label: "Painting", slug: "painting", glyph: "paint", tint: "var(--color-tint-civil)" },
  {
    label: "Wires & MCB",
    slug: "wires-mcb-distribution-boards",
    glyph: "wire",
    tint: "var(--color-tint-electrical)",
  },
  { label: "Plywood", slug: "plywood-mdf-hdhmr", glyph: "ply", tint: "var(--color-tint-civil)" },
  {
    label: "CPVC & tanks",
    slug: "cpvc-pipes-overhead-tanks",
    glyph: "pipe",
    tint: "var(--color-tint-plumbing)",
  },
  {
    label: "Hardware",
    slug: "general-hardware-tools",
    glyph: "tools",
    tint: "var(--color-tint-furniture)",
  },
  { label: "Lighting", slug: "lighting", glyph: "bulb", tint: "var(--color-tint-electrical)" },
];

/** A category inherits its L1 group's tint; it never picks its own. */
const GROUP_TINT: Record<string, string> = {
  cement: "var(--color-tint-civil)",
  tiling: "var(--color-tint-civil)",
  painting: "var(--color-tint-civil)",
  waterproofing: "var(--color-tint-civil)",
  "plywood-mdf-hdhmr": "var(--color-tint-civil)",
  fevicol: "var(--color-tint-civil)",
  "wires-mcb-distribution-boards": "var(--color-tint-electrical)",
  "switches-sockets": "var(--color-tint-electrical)",
  "conduits-gi-boxes": "var(--color-tint-electrical)",
  lighting: "var(--color-tint-electrical)",
  "ceiling-fans-exhaust": "var(--color-tint-electrical)",
  "appliances-power-backup": "var(--color-tint-electrical)",
  "power-tools-accessories": "var(--color-tint-electrical)",
  "cpvc-pipes-overhead-tanks": "var(--color-tint-plumbing)",
  "sanitary-bath-fittings": "var(--color-tint-plumbing)",
  "kitchen-sinks-faucets": "var(--color-tint-plumbing)",
};

function tintFor(categorySlug: string) {
  return GROUP_TINT[categorySlug] ?? "var(--color-tint-furniture)";
}

interface MobileHomeViewProps {
  deals: CatalogItem[];
  featured: CatalogItem[];
  newArrivals: CatalogItem[];
  categories: Category[];
}

export function MobileHomeView({ featured }: MobileHomeViewProps) {
  const { pincode, cityName, openLocationModal } = useNativeShell();

  // The artboard shows two. More would push the nav off a 852px frame.
  const popular = featured.slice(0, 2);

  return (
    <div className="flex flex-col bg-canvas">
      {/* Reserved safe area — the OS draws its status bar here. */}
      <div className="h-[59px] flex-none" />

      {/* Site chip, search, notifications */}
      <div className="flex items-center gap-[9px] px-4 pt-1.5">
        <button
          type="button"
          onClick={openLocationModal}
          className="flex h-10 min-w-0 flex-1 items-center justify-between rounded-full bg-paper py-0 pl-3.5 pr-2 shadow-card"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 flex-none text-ink-500" strokeWidth={1.7} aria-hidden />
            <span className="truncate text-[13px] font-bold tracking-[-0.01em] text-ink">
              {cityName} Site · <span className="tabular-nums text-ink-500">{pincode}</span>
            </span>
          </span>
          <ChevronDown className="size-4 flex-none text-ink-500" strokeWidth={1.7} aria-hidden />
        </button>

        <Link
          href="/search"
          aria-label="Search"
          className="flex size-[38px] flex-none items-center justify-center rounded-full bg-paper text-ink no-underline shadow-card"
        >
          <Search className="size-[19px]" strokeWidth={1.7} aria-hidden />
        </Link>
        <Link
          href="/account"
          aria-label="Notifications"
          className="flex size-[38px] flex-none items-center justify-center rounded-full bg-paper text-ink no-underline shadow-card"
        >
          <Bell className="size-[19px]" strokeWidth={1.7} aria-hidden />
        </Link>
      </div>

      {/* Greeting — grey lead-in, then ink */}
      <div className="px-4 pt-[18px]">
        {/* The artboard reads "Welcome, Bilal" — grey lead-in, then the name in
            ink. This view has no user prop, and a fabricated name is worse than
            a missing one, so the greeting stands alone in ink until the name is
            available to pass in. */}
        <h1 className="text-[23px] font-extrabold leading-7 tracking-[-0.022em] text-ink">
          Welcome
        </h1>
      </div>

      {/* First-list prompt */}
      <div className="px-4 pt-4">
        <div className="flex flex-col gap-3.5 rounded-[28px] bg-amber-soft p-5">
          <div className="flex items-start justify-between gap-3.5">
            <div className="flex-1">
              <h2 className="text-[19px] font-bold leading-6 tracking-[-0.018em] text-ink">
                Start your first list
              </h2>
              <p className="mt-[7px] text-[13px] font-medium leading-[18.5px] text-ink-700">
                Put everything for one pour, one wiring phase or one room in a list. Then reorder
                it in a tap next time.
              </p>
            </div>
            <CategoryGlyph name="clip" className="size-[52px] flex-none" />
          </div>
          <div className="flex gap-[9px]">
            <Link
              href="/categories"
              className="flex h-11 flex-1 items-center justify-center rounded-full bg-ink text-[13.5px] font-bold tracking-[-0.01em] text-white no-underline"
            >
              Add materials
            </Link>
            <Link
              href="/search"
              className="flex h-11 items-center justify-center rounded-full bg-paper px-[13px] text-[12.5px] font-bold tracking-[-0.01em] text-ink no-underline shadow-card"
            >
              Browse first
            </Link>
          </div>
        </div>
        <p className="mt-[11px] px-1 text-[11px] font-semibold leading-[14px] text-ink-500">
          This screen fills in as you order — your reorders, saved lists and what&apos;s running
          low at each site will lead it.
        </p>
      </div>

      {/* Category entry grid */}
      <div className="px-4 pt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink">
            Start with a category
          </h2>
          <Link
            href="/categories"
            className="text-[11px] font-bold leading-[14px] text-ink no-underline"
          >
            All 21
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {ENTRY_CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="no-underline">
              <div
                className="flex h-[74px] w-full items-center justify-center overflow-hidden rounded-[18px]"
                style={{ backgroundColor: c.tint }}
              >
                <CategoryGlyph name={c.glyph} className="size-8" />
              </div>
              <div className="mt-1.5 text-center text-[11px] font-semibold leading-[13px] text-ink">
                {c.label}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Popular — real catalog data */}
      {popular.length > 0 && (
        <div className="px-4 pt-5">
          <h2 className="text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink">
            Popular in Srinagar this week
          </h2>
          <div className="mt-[11px] grid grid-cols-2 gap-2.5">
            {popular.map((item) => (
              <Link
                key={item.id}
                href={`/product/${item.slug}`}
                className="rounded-[20px] bg-paper p-2 no-underline shadow-card"
              >
                <div
                  className="flex h-24 w-full items-center justify-center overflow-hidden rounded-[18px]"
                  style={{ backgroundColor: tintFor(item.categorySlug) }}
                >
                  <CategoryGlyph name="bag" className="size-11" />
                </div>
                <div className="mt-[9px] text-[9.5px] font-bold uppercase leading-3 tracking-[0.09em] text-ink-500">
                  {item.brandName}
                </div>
                <div className="mt-[3px] line-clamp-2 h-[34px] overflow-hidden text-[13px] font-bold leading-[17px] tracking-[-0.01em] text-ink">
                  {item.title}
                </div>
                <div className="mt-0.5 text-[14.5px] font-extrabold tabular-nums tracking-[-0.02em] text-ink">
                  {formatPaise(item.pricePaise)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* The shell wrapper already reserves nav clearance (pb-24). */}
      <div className="h-5 flex-none" />
    </div>
  );
}
