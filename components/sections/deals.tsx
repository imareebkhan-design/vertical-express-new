"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CatalogItem } from "@/lib/services/catalog";
import { ProductCard } from "@/components/product-card";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { paiseToRupees } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Deals({ items }: { items: CatalogItem[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows]);

  const scrollBy = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <section id="deals" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Deals Of The Week
          </h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            Fresh discounts every week on site essentials
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            aria-label="Scroll deals left"
            className={cn(
              "grid size-10 cursor-pointer place-items-center rounded-full border border-neutral-200 transition-all hover:border-ink hover:bg-ink hover:text-white active:scale-95",
              !canLeft && "pointer-events-none opacity-30"
            )}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            aria-label="Scroll deals right"
            className={cn(
              "grid size-10 cursor-pointer place-items-center rounded-full border border-neutral-200 transition-all hover:border-ink hover:bg-ink hover:text-white active:scale-95",
              !canRight && "pointer-events-none opacity-30"
            )}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </Reveal>

      <Stagger>
        <div
          ref={scroller}
          onScroll={updateArrows}
          className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
        >
          {items.map((item) => (
            <StaggerItem key={item.id} className="flex shrink-0">
              <ProductCard
                href={`/product/${item.slug}`}
                productId={item.id}
                product={{
                  id: item.variantId,
                  title: item.title,
                  brandLine: item.brandName,
                  price: paiseToRupees(item.pricePaise),
                  compareAt: paiseToRupees(item.compareAtPaise ?? item.pricePaise),
                  unit: item.unitLabel,
                  image: item.imageUrl ?? undefined,
                  bulkNote: item.hasBulkTiers ? "Bulk prices available" : undefined,
                }}
              />
            </StaggerItem>
          ))}
        </div>
      </Stagger>
    </section>
  );
}
