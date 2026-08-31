"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  CategoryGlyph,
  categoryTint,
  glyphFor,
  isGenericPlaceholder,
} from "@/components/ui/product-panel";

/** PDP image gallery with thumbnail rail; graceful fallback when images 404. */
export function ProductGallery({
  images,
  title,
  categorySlug,
}: {
  images: { url: string; alt: string }[];
  title: string;
  /** Drives the panel tint and the material drawing behind a missing photo. */
  categorySlug: string;
}) {
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
        className="relative flex h-[360px] sm:h-[470px] w-full items-center justify-center overflow-hidden rounded-[32px]"
        style={{ backgroundColor: categoryTint(categorySlug) }}
      >
        {current && !currentFailed && !isGenericPlaceholder(current.url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.alt}
            className="size-full object-contain p-8"
            onError={() => setFailed((f) => ({ ...f, [active]: true }))}
          />
        ) : (
          <div role="img" aria-label={title} className="grid size-full place-items-center">
            <CategoryGlyph name={glyphFor(categorySlug)} className="size-32" />
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
              style={{ backgroundColor: categoryTint(categorySlug) }}
              className={cn(
                "flex size-[80px] sm:size-[98px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] transition-all cursor-pointer",
                i === active ? "ring-2 ring-ink ring-offset-2" : "opacity-80 hover:opacity-100"
              )}
            >
              {isGenericPlaceholder(img.url) ? (
                <CategoryGlyph name={glyphFor(categorySlug)} className="size-9" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={img.url} alt={img.alt} className="size-full object-contain p-2" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

