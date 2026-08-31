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
    <div className="flex flex-col gap-3.5">
      <motion.div
        key={active}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-[360px] sm:h-[470px] w-full items-center justify-center overflow-hidden rounded-[32px] bg-civil-soft border border-line"
      >
        {current && !currentFailed && current.url !== "/placeholder-product.webp" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.alt}
            className="size-full object-contain p-8"
            onError={() => setFailed((f) => ({ ...f, [active]: true }))}
          />
        ) : (
          <div role="img" aria-label={title} className="grid size-full place-items-center text-ink-700">
            <Package className="size-24 stroke-[1.2]" aria-hidden />
          </div>
        )}
      </motion.div>

      {images.length > 1 && (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide py-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === active}
              className={cn(
                "flex size-[80px] sm:size-[98px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-civil-soft border border-line transition-all cursor-pointer",
                i === active ? "ring-2 ring-ink ring-offset-2" : "opacity-80 hover:opacity-100"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} className="size-full object-contain p-2" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

