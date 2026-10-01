"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Search, MapPin, ChevronDown } from "lucide-react";
import type { CatalogItem, listRooms } from "@/lib/services/catalog";
import type { Category } from "@/prisma/generated/client/client";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { ShopByRoom } from "@/components/mobile/home/shop-by-room";
import { QuantityHelpers } from "@/components/mobile/home/quantity-helpers";
import { CategoryGlyph, type GlyphName } from "./category-glyph";
import { formatPaise } from "@/lib/money";
import { TOTAL_CATEGORIES } from "@/components/ui/product-panel";
import { FirstOrderCard, HomeSearchPill, NotificationsBell, OrderAgainRail } from "@/components/mobile/home/home-lead";
import { useCart } from "@/hooks/use-cart";
import { getMyHomeFacts, type MyHomeFacts } from "@/actions/home";

/**
 * The phone-web home screen.
 *
 * Two compositions, chosen as the app chooses (`mobile/src/lib/first-run.ts`):
 * a customer with order history gets `Main`'s lead — "Order again" from their
 * own orders, then the category grid (W-07). Everybody else, including anybody
 * signed out and anybody while the answer is loading, gets `HomeFirstRun`.
 * `Main`'s saved lists and "running low at this site" are not drawn: there is
 * no saved-list model, and the consumption estimate behind "roughly 6 left" is
 * unconfirmed in the placeholder register. `HomeHomeowner` is not built on web.
 *
 * The page itself stays one cached page for everyone; the customer's facts are
 * fetched here, after it renders (`actions/home.ts`).
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
  rooms: Awaited<ReturnType<typeof listRooms>>;
  /** Injected for tests; the app uses the server action. */
  loadFacts?: () => Promise<MyHomeFacts>;
}

export function MobileHomeView({ featured, rooms, loadFacts = getMyHomeFacts }: MobileHomeViewProps) {
  const { pincode, cityName, hasChosenLocation, openLocationModal } = useNativeShell();
  const { addItem } = useCart();
  /* Null while unanswered or failed: the neutral answer, first-run, as in the app. */
  const [facts, setFacts] = useState<MyHomeFacts | null>(null);
  useEffect(() => {
    let live = true;
    loadFacts()
      .then((f) => live && setFacts(f))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [loadFacts]);
  const returning = (facts?.historyCount ?? 0) > 0;

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
              {hasChosenLocation ? (
                <>
                  {cityName} Site · <span className="tabular-nums text-ink-500">{pincode}</span>
                </>
              ) : (
                "Choose delivery location"
              )}
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
        <NotificationsBell />
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

      {returning && <HomeSearchPill />}

      {returning ? (
        <OrderAgainRail
          items={facts?.orderAgain ?? []}
          totalOrders={facts?.totalOrders ?? 0}
          onAdd={(item) => void addItem(item.variantId, 1, item.title)}
        />
      ) : (
        <FirstOrderCard />
      )}

      {/*
        The homeowner's entry point, above the trade taxonomy.

        Order matters and is the artboard's, not arbitrary: somebody redoing a
        bathroom does not know they need Tiling and Sanitary & Bath, so the room
        comes before the trade grid. A contractor scrolls straight past it.
      */}
      {!returning && <ShopByRoom rooms={rooms} />}

      {!returning && <QuantityHelpers />}

      {/* Category entry grid */}
      <div className="px-4 pt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink">
            Start with a category
          </h2>
          {/* 14px of text is too small a target (W-25); the padding makes it
              32px and the negative margin keeps the row where it was. */}
          <Link
            href="/categories"
            className="-mx-2 -my-[9px] inline-flex min-h-8 items-center px-2 text-[11px] font-bold leading-[14px] text-ink no-underline"
          >
            All {TOTAL_CATEGORIES}
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
      {!returning && popular.length > 0 && (
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
