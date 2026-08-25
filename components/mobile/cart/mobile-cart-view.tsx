"use client";

import React, { useState, useRef, useTransition, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

import { RefreshCw, Trash2, ArrowRight, ShoppingCart, Bookmark } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatPaise } from "@/lib/money";
import { triggerHaptic } from "@/lib/native/haptics";

export function MobileCartView() {
  const { summary, refresh, updateItem, removeItem, pending } = useCart();
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Pull to refresh gesture states
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRefresh = () => {
    triggerHaptic("medium");
    setRefreshing(true);
    setPullY(0);

    startTransition(async () => {
      await refresh();
      setTimeout(() => {
        setRefreshing(false);
        triggerHaptic("light");
      }, 1000);
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0) {
      setPullY(Math.min(diff * 0.4, 80));
    }
  };

  const handleTouchEnd = () => {
    setIsPulling(false);
    if (pullY > 55) {
      handleRefresh();
    } else {
      setPullY(0);
    }
  };

  const handleQtyDecrease = async (itemId: string, currentQty: number) => {
    if (pending) return;
    triggerHaptic("light");

    if (currentQty > 1) {
      await updateItem(itemId, currentQty - 1);
    } else {
      await removeItem(itemId);
    }
    await refresh();
  };

  const handleQtyIncrease = async (itemId: string, currentQty: number) => {
    if (pending) return;
    triggerHaptic("light");

    await updateItem(itemId, currentQty + 1);
    await refresh();
  };

  const handleItemRemove = async (itemId: string) => {
    triggerHaptic("medium");
    await removeItem(itemId);
    await refresh();
  };

  if (!mounted) return <CartSkeleton />;

  const isEmpty = !summary || summary.lines.length === 0;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex flex-col min-h-screen bg-surface pb-32 overflow-x-hidden"
    >
      {/* Pull-to-refresh spinner */}
      <div
        className="absolute left-0 right-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-150"
        style={{
          top: `${pullY - 44}px`,
          opacity: pullY > 15 ? 1 : 0,
        }}
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-white shadow-md text-brand-deep">
          <RefreshCw className={`size-4 ${refreshing || pullY > 55 ? "animate-spin text-brand" : ""}`} />
        </div>
      </div>

      {/* Sticky Native Header */}
      <div className="native-header sticky top-0 z-30 flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <div>
          <h1 className="text-base font-extrabold text-ink leading-none">Your Cart</h1>
          {!isEmpty && (
            <p className="text-[10px] text-ink/40 font-semibold mt-1 block">
              {summary.count} {summary.count === 1 ? "item" : "items"} inside
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          className={`flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink transition-transform ${
            refreshing ? "animate-spin text-brand-deep" : ""
          }`}
          title="Refresh Cart"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* Cart Content */}
      <div className="flex-1 flex flex-col">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white">
            <ShoppingCart className="size-16 text-ink/15 mb-4" strokeWidth={1.2} />
            <h2 className="text-base font-extrabold text-ink">Your cart is empty</h2>
            <p className="mt-1.5 text-xs text-ink/40 max-w-xs mx-auto leading-relaxed">
              Add cement, painting, plumbing supplies, or electrical gear to get started.
            </p>
            <Link
              href="/categories"
              onClick={() => triggerHaptic("light")}
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-brand-deep px-6 py-3 text-xs font-extrabold text-white shadow-md active:scale-95"
            >
              Browse Categories <ArrowRight className="size-4" />
            </Link>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Cart Items list */}
            <div className="rounded-2xl border border-mist/20 bg-white shadow-2xs divide-y divide-mist/10">
              {summary.lines.map((line) => (
                <div key={line.itemId} className="p-4 flex gap-3">
                  {/* Image container */}
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-mist/5 border border-mist/15">
                    {line.imageUrl ? (
                      <Image
                        src={line.imageUrl}
                        alt={line.title}
                        fill
                        className="object-contain p-1"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-ink/20">VE</div>
                    )}
                  </div>

                  {/* Info block */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h4 className="truncate text-xs font-bold text-ink leading-tight">{line.title}</h4>
                      <p className="text-[10px] text-ink/40 font-semibold mt-0.5 leading-none">
                        Unit price: {formatPaise(line.unitPricePaise)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-xs font-extrabold text-ink leading-none">
                        {formatPaise(line.lineTotalPaise)}
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Save for later placeholder */}
                        <button
                          onClick={() => triggerHaptic("light")}
                          className="flex size-7 items-center justify-center rounded-lg border border-mist/20 text-ink/45 hover:bg-mist/5"
                          title="Save for later"
                        >
                          <Bookmark className="size-3.5" />
                        </button>

                        <button
                          onClick={() => handleItemRemove(line.itemId)}
                          className="flex size-7 items-center justify-center rounded-lg border border-mist/20 text-danger hover:bg-danger/5"
                          title="Remove item"
                        >
                          <Trash2 className="size-3.5" />
                        </button>

                        {/* Stepper qty controls */}
                        <div className="flex h-7 items-center bg-brand-deep text-white rounded-lg px-1">
                          <button
                            onClick={() => handleQtyDecrease(line.itemId, line.qty)}
                            disabled={pending}
                            className="flex size-5.5 items-center justify-center font-bold hover:bg-white/10 rounded-md disabled:opacity-50"
                          >
                            -
                          </button>
                          <span className="text-[10px] font-extrabold px-1 text-center min-w-4">
                            {line.qty}
                          </span>
                          <button
                            onClick={() => handleQtyIncrease(line.itemId, line.qty)}
                            disabled={pending}
                            className="flex size-5.5 items-center justify-center font-bold hover:bg-white/10 rounded-md disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Delivery serviceability info card */}
            <div className="rounded-2xl border border-mist/20 bg-white p-4 shadow-2xs space-y-3">
              <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
                Delivery Details
              </h3>
              <p className="text-xs font-semibold text-ink/75 leading-relaxed">
                Vertical Express delivers building materials across Srinagar. Choose your exact delivery address on the next screen.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Summary Bar */}
      {!isEmpty && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-mist/25 px-4 pb-[calc(env(safe-area-inset-bottom,12px)+6px)] pt-3.5 flex items-center justify-between shadow-2xl">
          <div>
            <span className="text-[10px] font-extrabold text-ink/40 uppercase block leading-none">Cart Subtotal</span>
            <span className="text-base font-extrabold text-ink mt-1.5 block leading-none">
              {formatPaise(summary.lines.reduce((s, l) => s + l.lineTotalPaise, 0))}
            </span>
            <span className="text-[9px] text-ink/40 font-semibold mt-1 block">
              GST and Delivery calculated at checkout
            </span>
          </div>

          <Link
            href="/checkout"
            onClick={() => triggerHaptic("medium")}
            className="flex h-12 items-center justify-center rounded-xl bg-brand-deep px-8 text-xs font-extrabold text-white shadow-md hover:opacity-95 active:scale-98"
          >
            Checkout <ArrowRight className="ml-1.5 size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-surface pb-24 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)]">
        <div className="space-y-1.5">
          <div className="h-4.5 w-24 bg-mist/30 rounded-full" />
          <div className="h-3 w-16 bg-mist/25 rounded-full" />
        </div>
        <div className="size-8 rounded-full bg-mist/30" />
      </div>

      {/* Cart items skeleton */}
      <div className="p-4 space-y-4">
        <div className="rounded-2xl border border-mist/20 bg-white p-4 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="size-16 rounded-xl bg-mist/20 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 bg-mist/30 rounded-full" />
                <div className="h-3 w-16 bg-mist/20 rounded-full" />
                <div className="flex justify-between items-center mt-2">
                  <div className="h-4 w-12 bg-mist/30 rounded-full" />
                  <div className="h-7 w-20 bg-mist/25 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
