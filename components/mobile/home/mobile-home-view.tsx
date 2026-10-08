"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Search, MapPin, ChevronDown } from "lucide-react";
import type { CatalogItem, listRooms } from "@/lib/services/catalog";
import type { Category } from "@/prisma/generated/client/client";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { ShopByRoom } from "@/components/mobile/home/shop-by-room";
import { formatPaise } from "@/lib/money";
import { ProductPanel, isGenericPlaceholder } from "@/components/ui/product-panel";
import { HomeSearchPill, NotificationsBell, OrderAgainRail } from "@/components/mobile/home/home-lead";
import { useCart } from "@/hooks/use-cart";
import { getMyHomeFacts, type MyHomeFacts } from "@/actions/home";
import { HeroBanners } from "@/components/merchandising/hero-banners";
import { TrendingSrinagar } from "@/components/merchandising/trending-srinagar";
import { DealOfTheDay } from "@/components/merchandising/deal-of-the-day";
import type { DealProduct } from "@/lib/merchandising/deal";

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

/** The twelve categories the phone home leads with, three rows of four. */
const ENTRY_CATEGORIES: { label: string; slug: string }[] = [
  { label: "Cement", slug: "cement" },
  { label: "Tiling", slug: "tiling" },
  { label: "Painting", slug: "painting" },
  { label: "Plywood", slug: "plywood-mdf-hdhmr" },
  { label: "Wires & MCB", slug: "wires-mcb-distribution-boards" },
  { label: "Switches", slug: "switches-sockets" },
  { label: "Lighting", slug: "lighting" },
  { label: "Fans", slug: "ceiling-fans-exhaust" },
  { label: "Pipes & tanks", slug: "cpvc-pipes-overhead-tanks" },
  { label: "Bath fittings", slug: "sanitary-bath-fittings" },
  { label: "Waterproofing", slug: "waterproofing" },
  { label: "Hardware", slug: "general-hardware-tools" },
];

interface MobileHomeViewProps {
  deals: CatalogItem[];
  featured: CatalogItem[];
  newArrivals: CatalogItem[];
  categories: Category[];
  rooms: Awaited<ReturnType<typeof listRooms>>;
  /** Active category slug → catalogue name; merchandising links only to these. */
  categoryNames?: Record<string, string>;
  /** The configured Deal of the Day's product, or null. */
  dealProduct?: DealProduct | null;
  /** Injected for tests; the app uses the server action. */
  loadFacts?: () => Promise<MyHomeFacts>;
}

export function MobileHomeView({
  featured,
  rooms,
  categoryNames = {},
  dealProduct = null,
  loadFacts = getMyHomeFacts,
}: MobileHomeViewProps) {
  const { hasChosenLocation, locationLabel, openLocationModal } = useNativeShell();
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
                  <span className="font-semibold text-ink-500">Deliver to </span>
                  {locationLabel}
                </>
              ) : (
                "Where should we deliver?"
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

      {/* The page heading, for assistive tech; the banners carry the message. */}
      <h1 className="sr-only">Vertical Express — building materials in Srinagar</h1>

      {/* Campaign banners (lib/merchandising/home.ts), above everything else. */}
      <div className="px-4 pt-3.5">
        <HeroBanners compact />
      </div>

      {returning && <HomeSearchPill />}

      {/* A returning customer's own reorders still lead; a first-run customer's
          first-order card follows the merchandising below. */}
      {returning && (
        <OrderAgainRail
          items={facts?.orderAgain ?? []}
          totalOrders={facts?.totalOrders ?? 0}
          onAdd={(item) => void addItem(item.variantId, 1, item.title)}
        />
      )}

      {/* Category entry grid */}
      <div className="px-4 pt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink">
            Shop by category
          </h2>
          {/* 14px of text is too small a target (W-25); the padding makes it
              32px and the negative margin keeps the row where it was. */}
          <Link
            href="/categories"
            className="-mx-2 -my-[9px] inline-flex min-h-8 items-center px-2 text-[11px] font-bold leading-[14px] text-ink no-underline"
          >
            See all
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
          {ENTRY_CATEGORIES.filter((c) => c.slug in categoryNames || Object.keys(categoryNames).length === 0).map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="no-underline">
              <ProductPanel use="category" categorySlug={c.slug} label={c.label} className="ve-cat-tile aspect-square w-full rounded-[18px]" glyphClassName="size-8" />
              <div className="mt-1.5 text-center text-[11px] font-semibold leading-[13px] text-ink">
                {c.label}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <TrendingSrinagar categoryNames={categoryNames} compact />

      <DealOfTheDay product={dealProduct} compact />

      {/*
        The homeowner's entry point, above the trade taxonomy.

        Order matters and is the artboard's, not arbitrary: somebody redoing a
        bathroom does not know they need Tiling and Sanitary & Bath, so the room
        comes before the trade grid. A contractor scrolls straight past it.
      */}
      {!returning && <ShopByRoom rooms={rooms} />}

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
                {!isGenericPlaceholder(item.imageUrl) ? (
                  <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-[18px] bg-chip-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl ?? ""} alt="" className="size-full object-contain p-2" />
                  </div>
                ) : (
                  <ProductPanel categorySlug={item.categorySlug} label={item.title} className="h-24 w-full rounded-[18px]" />
                )}
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
