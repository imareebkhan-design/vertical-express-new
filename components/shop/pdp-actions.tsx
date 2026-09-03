"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductDetail } from "@/lib/services/catalog";
import { SpeedChip, speedClassFor } from "@/components/ui/speed-chip";
import { discountPercent } from "@/lib/money";

/**
 * PDP purchase panel: variant selector, tier-aware pricing, qty stepper,
 * add-to-cart, and a sticky mobile action bar. Uses the shared client cart
 * until Milestone 5 swaps in the server cart action.
 */
export function PdpActions({ product }: { product: ProductDetail }) {
  const { addItem } = useCart();
  const [variantId, setVariantId] = useState(
    product.variants.find((v) => v.isDefault)?.id ?? product.variants[0]?.id
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = useMemo(
    () => product.variants.find((v) => v.id === variantId) ?? product.variants[0],
    [product.variants, variantId]
  );

  // Resolve the unit price for the current quantity against the bulk ladder.
  const unitPaise = useMemo(() => {
    if (!variant) return 0;
    const applicable = [...variant.bulkTiers]
      .filter((t) => qty >= t.minQty)
      .sort((a, b) => b.minQty - a.minQty)[0];
    return applicable?.pricePaise ?? variant.pricePaise;
  }, [variant, qty]);

  if (!variant) return null;

  /* The selected variant's own stock. Per variant rather than per product,
     because a 50 kg bag being sold out says nothing about the 25 kg one — and
     the variant is what goes in the cart.

     Nothing here previously knew about stock at all: the page offered "Add to
     cart" on an empty shelf, and `lib/services/cart.ts` refused it with
     OUT_OF_STOCK only after the customer pressed the button. */
  const soldOut = !variant.inStock;

  const hasDiscount = variant.compareAtPaise != null && variant.compareAtPaise > variant.pricePaise;
  const lineTotal = unitPaise * qty;

  const handleAdd = async () => {
    const ok = await addItem(variant.id, qty, product.title);
    if (ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1600);
    }
  };

  const off = discountPercent(unitPaise, variant.compareAtPaise);
  const speed = speedClassFor(product.categoryIsBulk, product.deliverySpeed);

  return (
    <div className="flex flex-col gap-4">
      {/* Price · struck MRP · percent off */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-extrabold tabular-nums tracking-[-0.02em]">
          {formatPaise(unitPaise)}
        </span>
        {hasDiscount && (
          <s className="text-lg font-semibold tabular-nums text-ink-300">
            {formatPaise(variant.compareAtPaise!)}
          </s>
        )}
        {off !== null && (
          <span className="inline-flex h-[19px] items-center rounded-full bg-amber-soft px-[7px] text-[10px] font-extrabold text-ink">
            {off}% off
          </span>
        )}
      </div>

      {/* Tax treatment. Rates and HSN codes are owner-confirmed per category in
          lib/services/tax.ts, and prices are stored GST-inclusive, so this
          states what the checkout actually charges. */}
      <p className="-mt-2 text-[13px] font-medium leading-[18.5px] text-ink-700">
        Price {product.unitLabel.replace(/^per\s+/i, "per ")}, <strong className="font-bold">including GST</strong>.
      </p>

      {/* Delivery speed belongs to the goods, never to the header. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SpeedChip speed={speed} />
        <span className="text-[13px] font-medium text-ink-700">
          {speed === "scheduled"
            ? "Heavy material — delivered by truck."
            : "Held in our Srinagar store."}
        </span>
      </div>

      {/* Variant selector (only if multiple) */}
      {product.variants.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {product.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariantId(v.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200",
                v.id === variantId ? "bg-ink text-white" : "bg-chip text-ink hover:bg-hush",
                !v.inStock && "line-through opacity-55"
              )}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {/* Trade / bulk tier pricing is not promoted — owner decision, 25 Aug 2026.
          The ladder is NOT removed from price resolution above: lib/services/cart.ts
          and checkout.ts still apply it server-side, so hiding it here while leaving
          it there would make the displayed price differ from the charged price.
          Retiring it properly is a server change (cart, checkout, catalog, schema)
          and belongs with the Phase 3 work, not a visual pass. */}

      {/* Qty + add (desktop) */}
      <div className="hidden items-center gap-3 sm:flex">
        <div className="flex items-center rounded-[8px] border border-neutral-200 bg-surface-soft/40">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={soldOut}
            className="grid size-11 cursor-pointer place-items-center rounded-l-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-base font-extrabold" aria-live="polite">
            {qty}
          </span>
          <button
            onClick={() => setQty((q) => Math.min(999, q + 1))}
            disabled={soldOut}
            className="grid size-11 cursor-pointer place-items-center rounded-r-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase quantity"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <motion.button
          whileTap={soldOut ? undefined : { scale: 0.95 }}
          onClick={handleAdd}
          disabled={soldOut}
          className={
            soldOut
              ? "flex h-11 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-chip text-sm font-extrabold uppercase tracking-wider text-neutral-500"
              : "flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-ink text-sm font-extrabold uppercase tracking-wider text-white shadow-card hover:shadow-card-hover transition-all duration-200 hover:bg-ink/90 hover:-translate-y-0.5 active:translate-y-0"
          }
        >
          {soldOut
            ? "Out of stock"
            : added ? <><Check className="size-4" /> Added</> : <><ShoppingCart className="size-4" /> Add to cart · {formatPaise(lineTotal)}</>}
        </motion.button>
      </div>

      {/* Sticky mobile action bar */}
      <div className="fixed inset-x-0 bottom-20 z-30 flex items-center gap-3 border-t border-hairline-border bg-white/90 backdrop-blur-md p-3 shadow-[0_-4px_12px_rgba(17,17,17,0.08)] sm:hidden">
        <div className="flex items-center rounded-[8px] border border-neutral-200 bg-surface-soft/40">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={soldOut}
            className="grid size-10 cursor-pointer place-items-center rounded-l-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-9 text-center text-sm font-extrabold">{qty}</span>
          <button
            onClick={() => setQty((q) => Math.min(999, q + 1))}
            disabled={soldOut}
            className="grid size-10 cursor-pointer place-items-center rounded-r-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase quantity"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <motion.button
          whileTap={soldOut ? undefined : { scale: 0.95 }}
          onClick={handleAdd}
          disabled={soldOut}
          className={
            soldOut
              ? "flex h-11 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-chip text-sm font-extrabold uppercase tracking-wider text-neutral-500"
              : "flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-ink text-sm font-extrabold uppercase tracking-wider text-white shadow-card active:scale-95 transition-all duration-200"
          }
        >
          {soldOut ? "Out of stock" : added ? <><Check className="size-4" /> Added</> : <>Add · {formatPaise(lineTotal)}</>}
        </motion.button>
      </div>
    </div>
  );
}
