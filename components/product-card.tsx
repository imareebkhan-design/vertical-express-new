"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Minus, Package, Plus } from "lucide-react";
import type { Product } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { formatINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PlaceholderImage } from "@/components/placeholder-image";

export function ProductCard({ product, href }: { product: Product; href?: string }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = product.image && !imageFailed;
  const hasDiscount = product.compareAt > product.price;
  const discount = hasDiscount
    ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
    : 0;

  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-card border border-neutral-100 bg-white shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:w-72"
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
          <Badge className="absolute left-3 top-3 shadow-card">{discount}% OFF</Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          {product.brandLine}
        </p>
        <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-extrabold leading-snug">
          <MaybeLink href={href} className="hover:text-brand-deep">{product.title}</MaybeLink>
        </h3>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-extrabold">{formatINR(product.price)}</span>
          {hasDiscount && (
            <s className="text-sm font-semibold text-neutral-400">
              {formatINR(product.compareAt)}
            </s>
          )}
          <span className="text-[11px] font-semibold text-neutral-400">{product.unit}</span>
        </div>

        {product.bulkNote && (
          <p className="mt-1 rounded-md bg-surface px-2 py-1 text-[11px] font-bold text-brand-deep">
            {product.bulkNote}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-4">
          <div className="flex items-center rounded-lg border border-neutral-200">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid size-9 cursor-pointer place-items-center rounded-l-lg transition-colors hover:bg-surface active:bg-neutral-200"
              aria-label={`Decrease quantity of ${product.title}`}
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-extrabold" aria-live="polite">
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              className="grid size-9 cursor-pointer place-items-center rounded-r-lg transition-colors hover:bg-surface active:bg-neutral-200"
              aria-label={`Increase quantity of ${product.title}`}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => add(product, qty)}
            className="h-9 flex-1 cursor-pointer rounded-lg bg-brand text-xs font-extrabold uppercase tracking-widest text-ink shadow-card transition-colors hover:bg-brand-dark"
          >
            Add
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
