"use client";

import Link from "next/link";
import { Bell, Plus, Search } from "lucide-react";
import { CategoryGlyph } from "./category-glyph";
import { lastOrderedLabel, type OrderAgainItem } from "@/lib/order-again";

/**
 * What leads the phone-web home (W-07): the first-order card for somebody with
 * nothing to reorder, "Order again" for somebody with history — the app's rule
 * (`mobile/src/lib/first-run.ts`), keyed on order history and never on a guess
 * about whether somebody is new.
 */

/**
 * `HomeFirstRun`'s card, without its saved-list promise.
 *
 * The artboard says "Start your first list … Then reorder it in a tap next
 * time" and "your reorders, saved lists and what's running low … will lead
 * it". There is no saved-list model and the running-low estimate is
 * unconfirmed, so both were promises (W-07). What is true: what they order
 * leads this screen next time, as "Order again".
 */
export function FirstOrderCard() {
  return (
    <div className="px-4 pt-4">
      <div className="flex flex-col gap-3.5 rounded-[28px] bg-amber-soft p-5">
        <div className="flex items-start justify-between gap-3.5">
          <div className="flex-1">
            <h2 className="text-[19px] font-bold leading-6 tracking-[-0.018em] text-ink">Start your first order</h2>
            <p className="mt-[7px] text-[13px] font-medium leading-[18.5px] text-ink-700">
              Put everything for one pour, one wiring phase or one room in your cart. Next time, it&apos;s here to
              order again.
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
        This screen fills in as you order — what you&apos;ve ordered before will lead it.
      </p>
    </div>
  );
}

interface OrderAgainRailProps {
  items: OrderAgainItem[];
  /** All orders, for "See all N". */
  totalOrders: number;
  /** Adds one at today's price; the rail never quotes the price paid. */
  onAdd: (item: OrderAgainItem) => void;
}

/** `Main`'s "Order again" — the customer's own orders, newest first. */
export function OrderAgainRail({ items, totalOrders, onAdd }: OrderAgainRailProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="order-again" className="pt-5">
      <div className="flex items-baseline justify-between px-4">
        <h2 id="order-again" className="text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink">
          Order again
        </h2>
        {/* -m/p: a hit area of at least 24 px (WCAG 2.5.8) without moving the text. */}
        <Link href="/account/orders" className="-m-1.5 p-1.5 text-[11px] font-bold leading-[14px] text-ink no-underline">
          See all {totalOrders}
        </Link>
      </div>
      <ul className="mt-[11px] flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.variantId} className="relative w-[150px] flex-none rounded-[20px] bg-paper p-2 shadow-card">
            <Link
              href={`/product/${item.productSlug}`}
              aria-label={`${item.title}, last ordered ${lastOrderedLabel(item)}`}
              className="block no-underline"
            >
              <div className="flex h-[82px] w-full items-center justify-center overflow-hidden rounded-[16px] bg-tile">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="size-full object-contain p-2" />
                ) : (
                  <CategoryGlyph name="bag" className="size-9" />
                )}
              </div>
              <div className="mt-2 line-clamp-2 h-[34px] text-[13px] font-bold leading-[17px] tracking-[-0.01em] text-ink">
                {item.title}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-medium text-ink-500">{item.variantName}</div>
              <div className="mt-1.5 inline-block rounded-full bg-chip-soft px-2 py-0.5 text-[10.5px] font-bold text-ink">
                Last: {lastOrderedLabel(item)}
              </div>
            </Link>
            <button
              type="button"
              onClick={() => onAdd(item)}
              aria-label={`Add ${item.title} to cart`}
              className="absolute right-3.5 top-3.5 flex size-8 items-center justify-center rounded-full bg-ink text-white shadow-card"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The artboard's bell. There is no notification system, and it used to open
 * `/account` (W-19). A control that goes somewhere unrelated is worse than one
 * that plainly does nothing, so it is drawn disabled, as in the app.
 */
export function NotificationsBell() {
  return (
    <button
      type="button"
      disabled
      aria-label="Notifications, not available yet"
      className="flex size-[38px] flex-none items-center justify-center rounded-full bg-paper text-ink/40 opacity-55 shadow-card"
    >
      <Bell className="size-[19px]" strokeWidth={1.7} aria-hidden />
    </button>
  );
}

/**
 * `Main`'s search pill, under the greeting on the returning home — the app's
 * contractor layout has the same one, with the same hint. A link: it opens
 * search; it is not a field that pretends to take input here.
 */
export function HomeSearchPill() {
  return (
    <div className="px-4 pt-4">
      <Link
        href="/search"
        className="flex h-12 items-center gap-2.5 rounded-full bg-paper px-4 text-ink-500 no-underline shadow-card"
      >
        <Search className="size-[19px] text-ink" strokeWidth={1.7} aria-hidden />
        <span className="text-[14px] font-medium">Search cement, wire, fittings…</span>
      </Link>
    </div>
  );
}
