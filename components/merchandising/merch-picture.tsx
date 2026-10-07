"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import type { MerchImage } from "@/lib/merchandising/home";

/**
 * A merchandising picture that fills its (sized) parent, and fails quietly.
 *
 * The parent sets the box, so the picture can never shift the layout. If the
 * file is missing or will not decode, a tinted panel takes its place — the
 * card keeps its shape and its HTML label, and nothing renders a broken-image
 * icon.
 */
export function MerchPicture({
  image,
  sizes,
  priority = false,
  className = "",
  fallback = "var(--color-chip)",
  fit = "cover",
  children,
}: {
  image: MerchImage;
  sizes: string;
  priority?: boolean;
  className?: string;
  fallback?: string;
  /** "contain" for cut-out product pictures, which must never be cropped. */
  fit?: "cover" | "contain";
  /** Drawn only if the picture fails — e.g. the category's line drawing. */
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span role="img" aria-label={image.alt} className="absolute inset-0 flex items-center justify-center" style={{ background: fallback }}>
        {children}
      </span>
    );
  }
  return (
    <Image
      src={image.src}
      alt={image.alt}
      fill
      sizes={sizes}
      priority={priority}
      /* Cut-outs are pre-sized (640×480, ~23 KB) transparent WebP. The optimiser
         re-encodes them as JPEG for some requests, which turns the transparent
         background black, so they are served as they are. */
      unoptimized={fit === "contain"}
      className={`${fit === "contain" ? "object-contain" : "object-cover"} ${className}`}
      style={{ objectPosition: image.focal ?? "50% 50%" }}
      onError={() => setFailed(true)}
    />
  );
}
