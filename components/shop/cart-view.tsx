"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shop/empty-state";
import { CartLoading } from "@/components/shop/cart-loading";
import { ProductPanel, isGenericPlaceholder } from "@/components/ui/product-panel";
import { SpeedChip } from "@/components/ui/speed-chip";
import { groupCartByShipment } from "@/lib/cart-shipments";

/** Full cart page body — reads the live server cart from context. */
export function CartView() {
  const { summary, loaded, updateItem, removeItem, pending } = useCart();

  if (!loaded) return <CartLoading />;
  if (summary.lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        caption="Browse our categories and add materials — they'll show up here."
        actionLabel="Start shopping"
        actionHref="/categories"
      />
    );
  }

  const { subtotalPaise } = summary;

  /* The same rule checkout persists — see lib/cart-shipments.ts. Grouping here
     with a private copy of the rule is how the cart ends up promising a split
     that does not happen. */
  const shipments = groupCartByShipment(summary.lines);
  const total = shipments.length;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* Line items */}
      <div>
        {/* Lead line: state the split before the items, the way the design does. */}
        <p className="mb-5 text-[14.5px] font-medium leading-[22px] text-ink-700">
          {summary.count} {summary.count === 1 ? "item" : "items"}
          {total > 1 ? (
            <>
              , splitting into{" "}
              <strong className="font-bold text-ink">
                {total === 2 ? "two shipments" : `${total} shipments`}
              </strong>
              , delivered separately.
            </>
          ) : (
            "."
          )}
        </p>

        <div className="space-y-6">
          {shipments.map((group) => (
            <section key={group.sequence} aria-label={`Shipment ${group.sequence} of ${total}`}>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <SpeedChip speed={group.speedClass} />
                {total > 1 && (
                  <span className="text-[13px] font-bold tracking-[-0.01em] text-ink">
                    Shipment {group.sequence} of {total}
                  </span>
                )}
                <span className="text-[12px] font-medium text-ink-500">
                  {(() => {
                    const n = group.lines.reduce((sum, l) => sum + l.qty, 0);
                    return `${n} ${n === 1 ? "item" : "items"}`;
                  })()}
                </span>
              </div>
              <p className="mb-3 text-[12px] font-medium leading-4 text-ink-500">
                {group.speedClass === "express"
                  ? "Small goods from the Srinagar store."
                  : "Heavy material by truck, unloaded at the gate."}
              </p>

              <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {group.lines.map((line) => (
              <motion.li
                key={line.itemId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="flex gap-4 rounded-card border border-hairline-border bg-white p-3 shadow-card sm:p-4"
              >
                <Link
                  href={`/product/${line.productSlug}`}
                  className="size-20 shrink-0 overflow-hidden rounded-panel bg-tile sm:size-24"
                >
                  {line.imageUrl && !isGenericPlaceholder(line.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.imageUrl} alt={line.title} className="size-full object-contain p-2" />
                  ) : (
                    <ProductPanel categorySlug={line.categorySlug} label={line.title} className="size-full" />
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                        {line.brandName}
                      </p>
                      <Link
                        href={`/product/${line.productSlug}`}
                        className="line-clamp-2 text-sm font-extrabold leading-snug hover:text-brand-deep"
                      >
                        {line.title}
                      </Link>
                    </div>
                    <button
                      onClick={() => removeItem(line.itemId)}
                      aria-label={`Remove ${line.title}`}
                      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-500 transition-colors hover:bg-danger/5 hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center rounded-[8px] border border-hairline-border bg-surface-soft/40">
                      <button
                        onClick={() => updateItem(line.itemId, line.qty - 1)}
                        className="grid size-8 cursor-pointer place-items-center rounded-l-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-9 text-center text-sm font-extrabold">{line.qty}</span>
                      <button
                        onClick={() => updateItem(line.itemId, line.qty + 1)}
                        className="grid size-8 cursor-pointer place-items-center rounded-r-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300"
                        aria-label="Increase quantity"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-extrabold">{formatPaise(line.lineTotalPaise)}</p>
                      <p className="text-[11px] font-semibold text-neutral-400">
                        {formatPaise(line.unitPricePaise)} {line.unitLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* Summary */}
      <aside className="h-fit lg:sticky lg:top-24">
        <div className="rounded-[26px] border border-line bg-paper p-6 shadow-card">
          <h2 className="text-lg font-extrabold text-ink">Order summary</h2>
          <dl className="mt-4 space-y-2.5 text-[13.5px] font-bold">
            <div className="flex justify-between">
              <dt className="text-ink-500">Items ({summary.count})</dt>
              <dd className="tabular-nums text-ink">{formatPaise(subtotalPaise)}</dd>
            </div>
            {/* The artboard bills delivery per shipment (₹49 fast, ₹299 heavy),
                and both figures are unconfirmed in the placeholder register.

                This comment used to add "and there is no fee in
                ServiceablePincode to read", which is no longer true —
                `deliveryFeePaise` is on the table and `computeTotals` charges
                it. The cart still says where the number gets settled rather
                than showing one, because the fee depends on the delivery
                pincode and the cart does not know it: quoting a figure here
                and a different one at checkout is worse than quoting none. */}
            <div className="flex justify-between">
              <dt className="text-ink-500">
                Delivery{shipments.length > 1 ? ` · ${shipments.length} shipments` : ""}
              </dt>
              <dd className="text-ink-500">Calculated at checkout</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4 text-lg font-extrabold text-ink">
            <span>
              To pay
              <span className="ml-2 text-[11px] font-semibold text-ink-500">Includes GST</span>
            </span>
            <span className="tabular-nums">{formatPaise(subtotalPaise)}</span>
          </div>
          <Link href="/checkout" className="mt-5 block no-underline">
            <Button size="lg" className="w-full h-12 rounded-full font-bold">
              {/* Was "Choose delivery slots". Slot booking does not exist
                  (ISS-057) — the checkout step for it is rendered behind a
                  PlaceholderValue saying so — and this is the highest-intent
                  button on the site, promising the thing the very next screen
                  withdraws. The mobile cart already said "Checkout"; the two
                  now agree, and agree with what happens. */}
              {pending ? <Loader2 className="animate-spin" /> : "Checkout"}
            </Button>
          </Link>
          <Link
            href="/categories"
            className="mt-3 block text-center text-xs font-bold text-ink-500 hover:text-ink no-underline"
          >
            Continue shopping
          </Link>
        </div>
      </aside>
    </div>
  );
}
