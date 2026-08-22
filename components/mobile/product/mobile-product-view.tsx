"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  Truck,
  Wallet,
  ShieldCheck,
  ChevronDown,
  Check,
  Loader2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  X,
  Share2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProductDetail, CatalogItem } from "@/lib/services/catalog";
import { formatPaise, discountPercent } from "@/lib/money";
import { useCart } from "@/hooks/use-cart";
import { addToCart } from "@/actions/cart";
import { toggleWishlist } from "@/actions/wishlist";
import { triggerHaptic } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";
import { MobileProductCard } from "../home/mobile-product-card";
import { trackProductView, type RecentlyViewedItem } from "@/components/shop/recently-viewed";

interface MobileProductViewProps {
  product: ProductDetail;
  related: CatalogItem[];
}

export function MobileProductView({ product, related }: MobileProductViewProps) {
  const router = useRouter();

  // Cart & Wishlist hooks
  const { summary, refresh, wishlistIds, setWishlisted, updateItem, removeItem } = useCart();
  const [isPending, startTransition] = useTransition();
  const [, startWishlist] = useTransition();

  // Variant state
  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const [selectedVariant, setSelectedVariant] = useState(defaultVariant);

  // Gallery states
  const [activeImg, setActiveImg] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);

  // Serviceability check state
  const [pincode, setPincode] = useState("");
  const [checkingPin, setCheckingPin] = useState(false);
  const [pinResult, setPinResult] = useState<{
    serviceable: boolean;
    etaMinutes: number | null;
    deliveryFeePaise: number | null;
  } | null>(null);

  // Specifications/Description collapse state
  const [expandDesc, setExpandDesc] = useState(true);
  const [expandSpecs, setExpandSpecs] = useState(false);

  // Recently Viewed state
  const [recentItems, setRecentItems] = useState<RecentlyViewedItem[]>([]);

  const saved = wishlistIds.has(product.id);
  const discount = discountPercent(selectedVariant.pricePaise, selectedVariant.compareAtPaise);

  // Cart item matching selected variant
  const cartItem = summary?.lines?.find((l) => l.variantId === selectedVariant.id);

  // Track product view on mount
  useEffect(() => {
    trackProductView({
      slug: product.slug,
      title: product.title,
      imageUrl: product.images[0]?.url ?? null,
      pricePaise: defaultVariant?.pricePaise ?? 0,
      brandName: product.brandName,
    });

    // Load recent items from storage (excluding current product)
    try {
      const raw = localStorage.getItem("ve_recently_viewed_items");
      if (raw) {
        const parsed = JSON.parse(raw);
        setRecentItems(parsed.filter((item: RecentlyViewedItem) => item.slug !== product.slug));
      }
    } catch {}

    // Load pincode from storage
    const savedPin = localStorage.getItem("ve_pincode");
    if (savedPin) {
      setPincode(savedPin);
      checkServiceability(savedPin);
    }
  }, [product, defaultVariant]);

  const checkServiceability = async (pin: string) => {
    if (pin.length !== 6) return;
    setCheckingPin(true);
    setPinResult(null);

    try {
      const res = await fetch(`/api/serviceability/${pin}`);
      if (res.ok) {
        const data = await res.json();
        setPinResult(data);
      }
    } catch {} finally {
      setCheckingPin(false);
    }
  };

  const handlePincodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic("light");
    checkServiceability(pincode);
  };

  const handleWishlistToggle = () => {
    triggerHaptic("light");
    setWishlisted(product.id, !saved);

    startWishlist(async () => {
      const res = await toggleWishlist(product.id);
      if (res.ok) {
        setWishlisted(product.id, res.data.added);
      } else {
        setWishlisted(product.id, false);
      }
      await refresh();
    });
  };

  const handleShare = async () => {
    triggerHaptic("light");
    const shareUrl = `${window.location.origin}/product/${product.slug}`;
    const { shareContent } = await import("@/lib/native/share");
    await shareContent({
      title: product.title,
      text: `Check out ${product.title} from ${product.brandName} on Vertical Express!`,
      url: shareUrl,
      dialogTitle: "Share Product",
    });
  };

  const handleAddToCart = () => {
    if (isPending) return;
    triggerHaptic("medium");

    startTransition(async () => {
      await addToCart({ variantId: selectedVariant.id, qty: 1 });
      await refresh();
    });
  };

  const handleQtyDecrease = () => {
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

  const handleQtyIncrease = () => {
    if (!cartItem || isPending) return;
    triggerHaptic("light");

    startTransition(async () => {
      await updateItem(cartItem.itemId, cartItem.qty + 1);
      await refresh();
    });
  };

  const handleVariantSelect = (v: typeof defaultVariant) => {
    triggerHaptic("light");
    setSelectedVariant(v);
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-surface pb-32 overflow-x-hidden">
      {/* Sticky Native PDP Top bar */}
      <div className="native-header sticky top-0 z-30 flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <button
          onClick={() => {
            triggerHaptic("light");
            router.back();
          }}
          className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
        >
          <ArrowLeft className="size-4.5" />
        </button>
        <span className="text-xs font-bold text-ink max-w-[60%] truncate">
          {product.brandName}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleShare}
            className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
          >
            <Share2 className="size-4.5 text-ink/40" />
          </button>
          <button
            onClick={handleWishlistToggle}
            className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
          >
            <Heart className={cn("size-4.5 transition-colors", saved ? "fill-danger text-danger" : "text-ink/40")} />
          </button>
        </div>
      </div>

      {/* Swipe Gallery */}
      <div className="relative aspect-square w-full bg-tile border-b border-mist/10">
        {product.images.length > 0 ? (
          <div className="scrollbar-hide flex h-full overflow-x-auto snap-x snap-mandatory"
               onScroll={(e) => {
                 const width = e.currentTarget.offsetWidth;
                 const index = Math.round(e.currentTarget.scrollLeft / width);
                 setActiveImg(index);
               }}>
            {product.images.map((img, i) => (
              <div
                key={i}
                onClick={() => {
                  triggerHaptic("light");
                  setZoomScale(1);
                  setIsLightboxOpen(true);
                }}
                className="relative h-full w-full shrink-0 snap-center p-6"
              >
                <Image
                  src={img.url}
                  alt={img.alt || product.title}
                  fill
                  priority={i === 0}
                  className="object-contain p-4"
                  sizes="100vw"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-ink/30 text-sm font-semibold">
            No Images Available
          </div>
        )}

        {/* Floating image page indicator dots */}
        {product.images.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-1.5 z-10">
            {product.images.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "size-1.5 rounded-full transition-all duration-200",
                  activeImg === i ? "bg-brand-deep w-3.5" : "bg-ink/20"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Product Info Block */}
      <div className="p-4 space-y-4">
        {/* Brand & Title */}
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-deep">
            {product.brandName}
          </span>
          <h2 className="text-base font-extrabold text-ink mt-1 leading-snug">
            {product.title}
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-base font-extrabold text-ink">
              {formatPaise(selectedVariant.pricePaise)}
            </span>
            {selectedVariant.compareAtPaise && (
              <span className="text-xs text-ink/40 line-through">
                {formatPaise(selectedVariant.compareAtPaise)}
              </span>
            )}
            {discount && (
              <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-extrabold text-danger">
                {discount}% OFF
              </span>
            )}
          </div>
          <span className="text-[10px] text-ink/40 font-semibold mt-1 block">
            Inclusive of all taxes
          </span>
        </div>

        {/* Variant Selector */}
        {product.variants.length > 1 && (
          <div className="border-t border-mist/10 pt-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 mb-2">
              Select Variant / Pack Size
            </h4>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleVariantSelect(v)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-bold transition-all active:scale-95",
                    selectedVariant.id === v.id
                      ? "border-brand-deep bg-brand-deep/5 text-brand-deep" :"border-mist/20 bg-white text-ink/70"
                  )}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tier Pricing Grid */}
        {selectedVariant.bulkTiers.length > 0 && (
          <div className="rounded-2xl border border-brand/20 bg-brand/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-deep/10 px-1.5 py-0.5 text-[9px] font-extrabold text-brand-deep uppercase leading-none">
                Wholesale Price Tiers
              </span>
            </div>
            <div className="divide-y divide-brand/10">
              {selectedVariant.bulkTiers.map((tier, idx) => (
                <div key={idx} className="flex justify-between py-2 text-xs text-ink/80">
                  <span className="font-bold">Buy {tier.minQty}+ {product.unitLabel}s</span>
                  <span className="font-extrabold text-brand-deep">{formatPaise(tier.pricePaise)} / {product.unitLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Serviceability / Delivery Check */}
        <div className="border-t border-mist/10 pt-4 space-y-3">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40">
            Delivery Serviceability Check
          </h4>
          <form onSubmit={handlePincodeSubmit} className="flex gap-2">
            <input
              type="tel"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter delivery pincode"
              className="flex-1 rounded-xl border border-mist/20 bg-surface p-3 text-xs font-bold text-ink outline-none focus:border-brand-deep"
            />
            <button
              type="submit"
              disabled={checkingPin || pincode.length !== 6}
              className="rounded-xl bg-brand-deep px-5 py-3 text-xs font-bold text-white shadow-xs active:scale-95 disabled:opacity-50"
            >
              {checkingPin ? <Loader2 className="size-4 animate-spin" /> : "Check"}
            </button>
          </form>

          {/* Serviceability feedback alerts */}
          {pinResult && (
            <div className={cn(
              "flex items-center gap-2 rounded-xl p-3 text-xs font-bold",
              pinResult.serviceable
                ? "bg-emerald-600/10 text-emerald-700" :"bg-danger/10 text-danger"
            )}>
              {pinResult.serviceable ? (
                <>
                  <Check className="size-4 shrink-0" />
                  <span>Deliverable: ETA {pinResult.etaMinutes || "60"} mins to {pincode}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Delivery currently unavailable to {pincode}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Brand Trust badging */}
        <div className="grid grid-cols-3 gap-3 border-t border-b border-mist/10 py-4 text-center">
          {[
            { icon: Truck, label: "60-min delivery" },
            { icon: Wallet, label: "Pay on delivery" },
            { icon: ShieldCheck, label: "Genuine brand" },
          ].map(({ icon: IconComponent, label }) => (
            <div key={label} className="rounded-xl bg-surface p-2.5 border border-mist/10">
              <IconComponent className="mx-auto size-4.5 text-brand-deep" strokeWidth={1.8} />
              <p className="mt-1 text-[9px] font-bold text-ink/60">{label}</p>
            </div>
          ))}
        </div>

        {/* Accordions */}
        <div className="space-y-2">
          {/* Description */}
          {product.description && (
            <div className="rounded-2xl border border-mist/15 bg-white overflow-hidden shadow-2xs">
              <button
                onClick={() => setExpandDesc(!expandDesc)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left text-xs font-bold text-ink hover:bg-mist/5"
              >
                <span>Product Description</span>
                <ChevronDown className={cn("size-4 text-ink/40 transition-transform duration-200", expandDesc && "rotate-180")} />
              </button>
              {expandDesc && (
                <div className="px-4 pb-4 pt-1 text-xs font-medium text-ink/75 leading-relaxed">
                  {product.description}
                </div>
              )}
            </div>
          )}

          {/* Specifications */}
          {product.specs.length > 0 && (
            <div className="rounded-2xl border border-mist/15 bg-white overflow-hidden shadow-2xs">
              <button
                onClick={() => setExpandSpecs(!expandSpecs)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left text-xs font-bold text-ink hover:bg-mist/5"
              >
                <span>Product Specifications</span>
                <ChevronDown className={cn("size-4 text-ink/40 transition-transform duration-200", expandSpecs && "rotate-180")} />
              </button>
              {expandSpecs && (
                <div className="px-4 pb-4 pt-1 divide-y divide-mist/10">
                  {product.specs.map((s) => (
                    <div key={s.label} className="flex justify-between py-2 text-xs">
                      <span className="font-semibold text-ink/50">{s.label}</span>
                      <span className="font-bold text-ink text-right">{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Related Products Scroller */}
      {related.length > 0 && (
        <div className="py-4 border-t border-mist/10">
          <h3 className="px-4 text-xs font-extrabold text-ink uppercase tracking-wider mb-3">
            More in {product.categoryName}
          </h3>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
            {related.map((item) => (
              <div key={item.id} className="snap-center shrink-0 w-[148px]">
                <MobileProductCard item={item} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Viewed Scroller */}
      {recentItems.length > 0 && (
        <div className="py-4 border-t border-mist/10">
          <h3 className="px-4 text-xs font-extrabold text-ink uppercase tracking-wider mb-3">
            Recently Viewed
          </h3>
          <div className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
            {recentItems.map((item) => (
              <Link
                key={item.slug}
                href={`/product/${item.slug}`}
                onClick={() => triggerHaptic("light")}
                className="snap-center shrink-0 w-[124px] rounded-xl border border-mist/20 bg-white p-2.5 shadow-card transition-shadow hover:shadow-card-hover"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-mist/5">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      fill
                      className="object-contain p-1"
                      sizes="100px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-ink/20">VE</div>
                  )}
                </div>
                <div className="mt-2 min-w-0">
                  <h4 className="truncate text-[10px] font-extrabold uppercase text-brand-deep leading-none">
                    {item.brandName}
                  </h4>
                  <p className="truncate text-xs font-bold text-ink mt-0.5 leading-tight">{item.title}</p>
                  <p className="text-[10px] font-extrabold text-ink mt-1 leading-none">
                    {formatPaise(item.pricePaise)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Bottom Buy Drawer/CTA bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-mist/25 px-4 pb-[calc(env(safe-area-inset-bottom,12px)+6px)] pt-3.5 flex items-center justify-between shadow-2xl">
        <div>
          <span className="text-[10px] font-extrabold text-ink/40 uppercase block leading-none">Total Price</span>
          <span className="text-base font-extrabold text-ink mt-1.5 block leading-none">
            {formatPaise((cartItem?.qty || 1) * selectedVariant.pricePaise)}
          </span>
          <span className="text-[9px] font-bold text-brand-deep uppercase mt-1 block">
            {product.unitLabel} Price: {formatPaise(selectedVariant.pricePaise)}
          </span>
        </div>

        {cartItem ? (
          <div className="flex h-12 items-center bg-brand-deep text-white rounded-xl px-2 shadow-md">
            <button
              onClick={handleQtyDecrease}
              disabled={isPending}
              className="flex size-9 items-center justify-center text-lg font-bold hover:bg-white/10 rounded-md disabled:opacity-50"
            >
              -
            </button>
            <span className="text-sm font-extrabold px-3 text-center min-w-8">
              {cartItem.qty}
            </span>
            <button
              onClick={handleQtyIncrease}
              disabled={isPending}
              className="flex size-9 items-center justify-center text-lg font-bold hover:bg-white/10 rounded-md disabled:opacity-50"
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddToCart}
            disabled={isPending}
            className="flex h-12 items-center justify-center rounded-xl bg-brand-deep px-8 text-xs font-extrabold text-white shadow-md hover:opacity-95 active:scale-98 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "Add to Cart"}
          </button>
        )}
      </div>

      {/* Lightbox Pinch Zoom Swiper Overlay */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-between bg-black text-white p-6"
          >
            <div className="flex items-center justify-between pt-[env(safe-area-inset-top,12px)]">
              <button
                onClick={() => setIsLightboxOpen(false)}
                className="size-10 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20"
              >
                <X className="size-5" />
              </button>
              <h2 className="text-xs font-bold uppercase tracking-wider">Image Zoom</h2>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setZoomScale(s => Math.min(s + 0.5, 3.5))}
                  className="size-10 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20"
                >
                  <ZoomIn className="size-4.5" />
                </button>
                <button
                  onClick={() => setZoomScale(s => Math.max(s - 0.5, 1))}
                  className="size-10 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20"
                >
                  <ZoomOut className="size-4.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              <motion.div
                animate={{ scale: zoomScale }}
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                className="relative w-full h-[60vh] max-h-[500px]"
              >
                <Image
                  src={product.images[activeImg]?.url}
                  alt={product.images[activeImg]?.alt || product.title}
                  fill
                  className="object-contain"
                  sizes="100vw"
                />
              </motion.div>
            </div>

            <div className="pb-12 text-center text-xs font-bold text-white/50">
              Image {activeImg + 1} of {product.images.length} • Zoom: {zoomScale.toFixed(1)}x
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
