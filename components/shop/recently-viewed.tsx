"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatPaise } from "@/lib/money";

export interface RecentlyViewedItem {
  slug: string;
  title: string;
  imageUrl: string | null;
  pricePaise: number;
  brandName: string;
}

const STORAGE_KEY = "ve_recently_viewed_items";

export function trackProductView(item: RecentlyViewedItem) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let items: RecentlyViewedItem[] = raw ? JSON.parse(raw) : [];
    // Remove existing if present
    items = items.filter((i) => i.slug !== item.slug);
    // Unshift new item
    items.unshift(item);
    // Keep max 8 items
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {}
}

export function RecentlyViewedTracker({ item }: { item: RecentlyViewedItem }) {
  useEffect(() => {
    trackProductView(item);
  }, [item]);

  return null;
}

export function RecentlyViewedSection({ currentSlug }: { currentSlug?: string }) {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: RecentlyViewedItem[] = JSON.parse(raw);
        setItems(parsed.filter((i) => i.slug !== currentSlug));
      }
    } catch {}
  }, [currentSlug]);

  if (items.length === 0) return null;

  return (
    <section aria-label="Recently viewed products" className="mt-12">
      <h2 className="mb-6 text-xl font-extrabold tracking-tight sm:text-2xl">
        Recently Viewed
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.slug}
            href={`/product/${item.slug}`}
            className="group rounded-card border border-hairline-border bg-white p-3 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-surface/60">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, 20vw"
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-neutral-400">
                  No image
                </div>
              )}
            </div>
            <div className="mt-2.5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-deep">
                {item.brandName}
              </p>
              <h3 className="line-clamp-1 text-xs font-bold text-ink group-hover:underline">
                {item.title}
              </h3>
              <p className="mt-1 text-sm font-extrabold text-ink">
                {formatPaise(item.pricePaise)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
