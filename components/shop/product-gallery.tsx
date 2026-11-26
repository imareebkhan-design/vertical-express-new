"use client";

import { PRODUCT_PHOTO, PRODUCT_PHOTO_SURFACE } from "@/lib/product-media";
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
  const showsPhoto = Boolean(current && !currentFailed && !isGenericPlaceholder(current.url));

  return (
    <div className="flex flex-col gap-3.5">
      <motion.div
        key={active}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative flex aspect-square max-h-[560px] w-full items-center justify-center overflow-hidden rounded-[32px]",
          showsPhoto && PRODUCT_PHOTO_SURFACE
        )}
        style={showsPhoto ? undefined : { backgroundColor: categoryTint(categorySlug) }}
      >
        {showsPhoto && current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.alt}
            className={PRODUCT_PHOTO}
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
              style={isGenericPlaceholder(img.url) ? { backgroundColor: categoryTint(categorySlug) } : undefined}
              className={cn(
                "flex size-[80px] sm:size-[98px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] transition-all cursor-pointer",
                !isGenericPlaceholder(img.url) && PRODUCT_PHOTO_SURFACE,
                i === active ? "ring-2 ring-ink ring-offset-2" : "opacity-80 hover:opacity-100"
              )}
            >
              {isGenericPlaceholder(img.url) ? (
                <CategoryGlyph name={glyphFor(categorySlug)} className="size-9" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={img.url} alt={img.alt} className={PRODUCT_PHOTO} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

