"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shop/empty-state";
import { PlaceholderImage } from "@/components/placeholder-image";

/** Full cart page body — reads the live server cart from context. */
export function CartView() {
  const { summary, updateItem, removeItem, pending } = useCart();

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

  const { subtotalPaise, qualifiesFreeDelivery, freeDeliveryRemainingPaise, freeDeliveryThresholdPaise } = summary;
  const progress = Math.min(100, (subtotalPaise / freeDeliveryThresholdPaise) * 100);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* Line items */}
      <div>
        {/* Free-delivery meter */}
        <div className="mb-5 rounded-card border border-hairline-border bg-surface-soft/30 p-4">
          {qualifiesFreeDelivery ? (
            <p className="text-sm font-extrabold text-success">Free delivery applied.</p>
          ) : (
            <p className="text-sm font-bold text-neutral-600">
              Add <span className="text-brand-deep">{formatPaise(freeDeliveryRemainingPaise)}</span> more to
              unlock free delivery
            </p>
          )}
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <motion.div
              className="h-full rounded-full bg-brand"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {summary.lines.map((line) => (
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
                  className="size-20 shrink-0 overflow-hidden rounded-lg bg-tile sm:size-24"
                >
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.imageUrl} alt={line.title} className="size-full object-contain p-2" />
                  ) : (
                    <PlaceholderImage label={line.title} className="size-full" iconClassName="size-8" />
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
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
                      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-danger/5 hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  {line.appliedTierMinQty && line.appliedTierMinQty > 1 && (
                    <p className="mt-1 text-[11px] font-bold text-brand-deep">
                      Bulk price applied ({line.appliedTierMinQty}+)
                    </p>
                  )}
                  {line.nextTier && (
                    <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                      Add {line.nextTier.minQty - line.qty} more for{" "}
                      {formatPaise(line.nextTier.pricePaise)} {line.unitLabel}
                    </p>
                  )}

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
      </div>

      {/* Summary */}
      <aside className="h-fit lg:sticky lg:top-24">
        <div className="rounded-card border border-hairline-border bg-white p-5 shadow-card">
          <h2 className="text-lg font-extrabold">Order summary</h2>
          <dl className="mt-4 space-y-2 text-sm font-bold">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal ({summary.count} items)</dt>
              <dd>{formatPaise(subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Delivery</dt>
              <dd className={qualifiesFreeDelivery ? "text-success" : ""}>
                {qualifiesFreeDelivery ? "FREE" : "Calculated at checkout"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-between border-t border-hairline-border pt-4 text-base font-extrabold">
            <span>Total</span>
            <span>{formatPaise(subtotalPaise)}</span>
          </div>
          <Link href="/checkout" className="mt-5 block">
            <Button size="lg" className="w-full">
              {pending ? <Loader2 className="animate-spin" /> : "Proceed to checkout"}
            </Button>
          </Link>
          <Link
            href="/categories"
            className="mt-3 block text-center text-xs font-bold text-neutral-500 hover:text-ink"
          >
            Continue shopping
          </Link>
        </div>
      </aside>
    </div>
  );
}
