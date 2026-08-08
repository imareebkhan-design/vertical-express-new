"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Star, Heart } from "lucide-react";
import { motion } from "framer-motion";
import type { CatalogItem } from "@/lib/services/catalog";
import { formatPaise, discountPercent } from "@/lib/money";
import { addToCart } from "@/actions/cart";
import { toggleWishlist } from "@/actions/wishlist";
import { useCart } from "@/hooks/use-cart";
import { triggerHaptic } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

const MotionImage = motion(Image);

interface MobileProductCardProps {
  item: CatalogItem;
}

export function MobileProductCard({ item }: MobileProductCardProps) {
  const { summary, refresh, wishlistIds, setWishlisted, updateItem, removeItem } = useCart();
  const [isPending, startTransition] = useTransition();
  const [, startWishlist] = useTransition();

  const saved = wishlistIds.has(item.id);
  const discount = discountPercent(item.pricePaise, item.compareAtPaise);

  // Find if item is already in cart
  const cartItem = summary?.lines?.find((l) => l.variantId === item.variantId);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.inStock || isPending) return;

    triggerHaptic("medium");

    startTransition(async () => {
      await addToCart({ variantId: item.variantId, qty: 1 });
      await refresh();
    });
  };

  const handleQuantityDecrease = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cartItem || isPending) return;

    triggerHaptic("light");
    startTransition(async () => {
      if (cartItem.qty > 1) {
        await updateItem(cartItem.itemId, cartItem.qty - 1);
      } else {
        await removeItem(cartItem.itemId);
      }
      await refresh();
    });
  };

  const handleQuantityIncrease = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cartItem || isPending) return;

    triggerHaptic("light");
    startTransition(async () => {
      await updateItem(cartItem.itemId, cartItem.qty + 1);
      await refresh();
    });
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    triggerHaptic("light");
    setWishlisted(item.id, !saved); // optimistic update

    startWishlist(async () => {
      const res = await toggleWishlist(item.id);
      if (res.ok) {
        setWishlisted(item.id, res.data.added);
      } else {
        setWishlisted(item.id, false); // rollback
      }
      await refresh();
    });
  };

  return (
    <Link
      href={`/product/${item.slug}`}
      onClick={() => triggerHaptic("light")}
      className="group relative flex flex-col justify-between rounded-2xl border border-mist/20 bg-surface p-3 shadow-card transition-shadow hover:shadow-card-hover active:scale-[0.98]"
    >
      <div>
        {/* Badges Overlay */}
        <div className="flex items-center justify-between gap-1 mb-2">
          {discount && item.inStock ? (
            <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-extrabold text-danger">
              -{discount}% OFF
            </span>
          ) : <div />}

          {item.hasBulkTiers && item.inStock && (
            <span className="rounded-md bg-brand-deep/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-deep">
              Bulk Savings
            </span>
          )}
        </div>

        {/* Product Image Container */}
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-mist/10 mb-3">
          {item.imageUrl ? (
            <MotionImage
              src={item.imageUrl}
              alt={item.title}
              layoutId={`img-${item.id}`}
              fill
              className={cn(
                "object-cover transition-transform group-hover:scale-105",
                !item.inStock && "opacity-40 grayscale"
              )}
              sizes="(max-width: 768px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink/30 text-xs font-medium">
              No Image
            </div>
          )}

          {/* Out of Stock Overlay */}
          {!item.inStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[0.5px]">
              <span className="rounded-lg bg-ink/80 px-2.5 py-1 text-[9px] font-extrabold tracking-wider text-white uppercase shadow-sm">
                Sold Out
              </span>
            </div>
          )}

          {/* Wishlist Heart Icon */}
          <button
            type="button"
            onClick={handleWishlistToggle}
            className="absolute top-1.5 right-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-white/90 shadow-xs backdrop-blur-xs transition-transform active:scale-90"
            aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
          >
            <Heart
              className={cn(
                "size-3.5 transition-colors",
                saved ? "fill-danger text-danger" : "text-ink/40"
              )}
            />
          </button>
        </div>

        {/* Title & Brand */}
        <p className="text-[9px] font-extrabold uppercase tracking-wider text-ink/40">{item.brandName}</p>
        <h3 className="line-clamp-2 text-xs font-bold text-ink mt-0.5 leading-snug">{item.title}</h3>

        {/* Rating */}
        {item.ratingCount > 0 && (
          <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-ink/60">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            <span>{item.ratingAvg.toFixed(1)}</span>
            <span className="text-ink/35">({item.ratingCount})</span>
          </div>
        )}
      </div>

      {/* Pricing & Add Button */}
      <div className="mt-3 flex items-end justify-between gap-2 pt-2 border-t border-mist/20">
        <div>
          <p className="text-xs font-extrabold text-ink leading-tight">{formatPaise(item.pricePaise)}</p>
          {item.compareAtPaise && (
            <p className="text-[9px] text-ink/40 line-through leading-none mt-0.5">{formatPaise(item.compareAtPaise)}</p>
          )}
        </div>

        {/* Button / Quantity Selector */}
        {cartItem && item.inStock ? (
          <div className="flex h-8 items-center bg-brand-deep text-white rounded-xl px-1">
            <button
              type="button"
              onClick={handleQuantityDecrease}
              disabled={isPending}
              className="flex size-6 items-center justify-center font-bold hover:bg-white/10 rounded-md disabled:opacity-50"
            >
              -
            </button>
            <span className="text-[11px] font-extrabold px-1 text-center min-w-4">
              {cartItem.qty}
            </span>
            <button
              type="button"
              onClick={handleQuantityIncrease}
              disabled={isPending}
              className="flex size-6 items-center justify-center font-bold hover:bg-white/10 rounded-md disabled:opacity-50"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={isPending || !item.inStock}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all shadow-xs",
              !item.inStock
                ? "bg-mist/30 text-ink/30 cursor-not-allowed"
                : "bg-brand-deep text-white hover:opacity-95 active:scale-90"
            )}
            title={!item.inStock ? "Out of stock" : "Quick Add to Cart"}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
    </Link>
  );
}
