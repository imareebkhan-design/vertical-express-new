"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Heart, Minus, Plus } from "lucide-react";
import type { Product } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { toggleWishlist } from "@/actions/wishlist";
import { formatINR, cn } from "@/lib/utils";
import { ProductPanel, isGenericPlaceholder } from "@/components/ui/product-panel";
import { PRICE_ON_REQUEST_LABEL } from "@/lib/catalog-visibility";

interface ProductCardProps {
  product: Product;
  /** PDP link target. */
  href?: string;
  /** Product id (not variant id) — enables the wishlist heart when present. */
  productId?: string;
  wishlisted?: boolean;
}

export function ProductCard({ product, href, productId, wishlisted = false }: ProductCardProps) {
  const { addItem, wishlistIds, setWishlisted } = useCart();
  const [qty, setQty] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const [added, setAdded] = useState(false);
  const [, startWishlist] = useTransition();

  // Source of truth: explicit prop (wishlist page) OR hydrated context set.
  const saved = wishlisted || (productId ? wishlistIds.has(productId) : false);

  /* Undefined means the caller did not say, which renders as before. Only an
     explicit false marks the tile out of stock. */
  const soldOut = product.inStock === false && product.price != null;

  const showImage = !isGenericPlaceholder(product.image) && !imageFailed;
  /* Catalog-only: no price, discount, stock state or cart controls (soldOut
     above is false for them — "out of stock" would be a stock claim with
     nothing behind it). The cart service refuses these products as well. */
  const price = product.price;
  const compareAt = product.compareAt;
  const onRequest = price == null;
  const hasDiscount = price != null && compareAt != null && compareAt > price;
  const discount = hasDiscount ? Math.round(((compareAt - price) / compareAt) * 100) : 0;

  const handleAdd = async () => {
    if (onRequest) return;
    const ok = await addItem(product.id, qty, product.title);
    if (ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    }
  };

  const handleWishlist = () => {
    if (!productId) return;
    setWishlisted(productId, !saved); // optimistic
    startWishlist(async () => {
      const result = await toggleWishlist(productId);
      if (result.ok) setWishlisted(productId, result.data.added);
      else setWishlisted(productId, false); // rollback (e.g. not logged in → send to login)
    });
  };

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-line bg-paper shadow-card transition-shadow duration-200 hover:shadow-card-hover sm:w-72"
    >
      <div className="relative overflow-hidden">
        <MaybeLink href={href}>
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- optional asset with runtime fallback
            <img
              src={product.image}
              alt={product.title}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="aspect-square w-full bg-white object-contain p-4 transition-transform duration-500 ease-[var(--ease-brand)] group-hover:scale-[1.04]"
            />
          ) : (
            <ProductPanel
              categorySlug={product.categorySlug ?? ""}
              label={product.title}
              className="aspect-square w-full transition-transform duration-500 ease-[var(--ease-brand)] group-hover:scale-[1.04]"
              glyphClassName="size-1/3"
            />
          )}
        </MaybeLink>
        {hasDiscount && (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-brand px-2.5 py-0.5 font-sans text-[10px] font-extrabold tracking-wide text-ink shadow-card">
            {discount}% OFF
          </span>
        )}
        {productId && (
          <button
            onClick={handleWishlist}
            aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
            aria-pressed={saved}
            className="absolute right-3 top-3 grid size-8 cursor-pointer place-items-center rounded-full bg-white/90 shadow-card backdrop-blur transition-transform hover:scale-110 active:scale-95"
          >
            <Heart
              className={cn("size-4 transition-colors", saved ? "fill-ink text-ink" : "text-neutral-500")}
            />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          {product.brandLine}
        </p>
        <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-extrabold leading-snug">
          <MaybeLink href={href} className="hover:text-brand-deep">
            {product.title}
          </MaybeLink>
        </h3>

        {onRequest ? (
          <p className="mt-2 text-sm font-extrabold text-ink-700">{PRICE_ON_REQUEST_LABEL}</p>
        ) : (
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-extrabold">{formatINR(price)}</span>
            {hasDiscount && (
              <s className="text-sm font-semibold text-neutral-400">{formatINR(compareAt)}</s>
            )}
            <span className="text-[11px] font-semibold text-neutral-400">{product.unit}</span>
          </div>
        )}


        {soldOut && (
          <p className="mt-2 text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
            Out of stock
          </p>
        )}

        {onRequest ? (
          <div className="mt-auto pt-4">
            {href && (
              <Link
                href={href}
                className="flex h-9 items-center justify-center rounded-full border border-neutral-200 text-xs font-extrabold uppercase tracking-wider text-ink transition-colors hover:bg-surface-soft"
              >
                View details
              </Link>
            )}
          </div>
        ) : (
        <div className="mt-auto flex items-center gap-2 pt-4">
          <div
            className={`flex items-center rounded-[8px] border border-neutral-200 bg-surface-soft/40 ${
              soldOut ? "opacity-40" : ""
            }`}
          >
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={soldOut}
              className="grid size-9 cursor-pointer place-items-center rounded-l-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed"
              aria-label={`Decrease quantity of ${product.title}`}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-extrabold" aria-live="polite">
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => Math.min(999, q + 1))}
              disabled={soldOut}
              className="grid size-9 cursor-pointer place-items-center rounded-r-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed"
              aria-label={`Increase quantity of ${product.title}`}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {/* The cart service already refuses this (OUT_OF_STOCK), so the button
              never had a way to succeed — it just did not say so until pressed. */}
          <motion.button
            whileTap={soldOut ? undefined : { scale: 0.95 }}
            onClick={handleAdd}
            disabled={soldOut}
            aria-label={soldOut ? `${product.title} is out of stock` : undefined}
            className={
              soldOut
                ? "flex h-9 flex-1 cursor-not-allowed items-center justify-center gap-1 rounded-full bg-chip text-xs font-extrabold uppercase tracking-wider text-neutral-500"
                : "flex h-9 flex-1 cursor-pointer items-center justify-center gap-1 rounded-full bg-ink text-xs font-extrabold uppercase tracking-wider text-white shadow-card hover:shadow-card-hover transition-all duration-200 hover:bg-ink/90 hover:-translate-y-0.5 active:translate-y-0"
            }
          >
            {soldOut ? "Sold out" : added ? <><Check className="size-3.5" /> Added</> : "Add"}
          </motion.button>
        </div>
        )}
      </div>
    </motion.article>
  );
}

function MaybeLink({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
