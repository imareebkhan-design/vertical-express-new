"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Heart, Minus, Package, Plus } from "lucide-react";
import type { Product } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { toggleWishlist } from "@/actions/wishlist";
import { formatINR, cn } from "@/lib/utils";
import { PlaceholderImage } from "@/components/placeholder-image";

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

  const showImage = product.image && !imageFailed;
  const hasDiscount = product.compareAt > product.price;
  const discount = hasDiscount
    ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
    : 0;

  const handleAdd = async () => {
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
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-card border border-hairline-border bg-white shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:w-72"
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
            <PlaceholderImage
              label={product.title}
              icon={product.icon ?? Package}
              className="aspect-square w-full transition-transform duration-500 ease-[var(--ease-brand)] group-hover:scale-[1.04]"
              iconClassName="size-16"
              showLabel
            />
          )}
        </MaybeLink>
        {hasDiscount && (
          <span className="absolute left-3 top-3 z-10 bg-champagne-gold text-ink-black font-sans font-extrabold text-[10px] px-2 py-0.5 rounded-[4px] shadow-sm uppercase tracking-wider">
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
              className={cn("size-4 transition-colors", saved ? "fill-danger text-danger" : "text-neutral-500")}
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

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-extrabold">{formatINR(product.price)}</span>
          {hasDiscount && (
            <s className="text-sm font-semibold text-neutral-400">{formatINR(product.compareAt)}</s>
          )}
          <span className="text-[11px] font-semibold text-neutral-400">{product.unit}</span>
        </div>

        {product.bulkNote && (
          <p className="mt-1 rounded-md bg-surface px-2 py-1 text-[11px] font-bold text-brand-deep">
            {product.bulkNote}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-4">
          <div className="flex items-center rounded-[8px] border border-neutral-200 bg-surface-soft/40">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid size-9 cursor-pointer place-items-center rounded-l-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300"
              aria-label={`Decrease quantity of ${product.title}`}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-extrabold" aria-live="polite">
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => Math.min(999, q + 1))}
              className="grid size-9 cursor-pointer place-items-center rounded-r-[8px] transition-colors hover:bg-neutral-200 active:bg-neutral-300"
              aria-label={`Increase quantity of ${product.title}`}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleAdd}
            className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[8px] bg-brand text-xs font-extrabold uppercase tracking-wider text-ink-black shadow-[0_2px_4px_rgba(252,189,0,0.15)] hover:shadow-[0_4px_12px_rgba(252,189,0,0.3)] transition-all duration-200 hover:bg-brand-dark hover:-translate-y-0.5 active:translate-y-0"
          >
            {added ? <><Check className="size-3.5" /> Added</> : "Add"}
          </motion.button>
        </div>
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
