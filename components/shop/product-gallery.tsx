"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** PDP image gallery with thumbnail rail; graceful fallback when images 404. */
export function ProductGallery({ images, title }: { images: { url: string; alt: string }[]; title: string }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  const hasImages = images.length > 0;
  const current = hasImages ? images[active] : null;
  const currentFailed = failed[active];

  return (
    <div className="flex flex-col gap-3">
      <motion.div
        key={active}
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative aspect-square overflow-hidden rounded-panel bg-tile"
      >
        {current && !currentFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- runtime fallback needed
          <img
            src={current.url}
            alt={current.alt}
            className="size-full object-contain p-6"
            onError={() => setFailed((f) => ({ ...f, [active]: true }))}
          />
        ) : (
          <div role="img" aria-label={title} className="grid size-full place-items-center">
            <Package className="size-20 text-sky-900/20" strokeWidth={1.2} aria-hidden />
          </div>
        )}
      </motion.div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === active}
              className={cn(
                "size-16 shrink-0 overflow-hidden rounded-chip border-2 bg-tile transition-colors",
                i === active ? "border-brand-deep" : "border-transparent hover:border-neutral-300"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} className="size-full object-contain p-1.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
