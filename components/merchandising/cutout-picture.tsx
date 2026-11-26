"use client";

import { useState, type ReactNode } from "react";
import type { MerchImage } from "@/lib/merchandising/home";

/**
 * A cut-out product picture (transparent WebP, pre-sized) that fills its sized
 * parent and is never cropped. If it fails, `children` — the category's line
 * drawing — is shown instead, so the tile keeps its shape and meaning.
 *
 * A plain <img>, not next/image: these files are already small and must not be
 * re-encoded (the optimiser turned their transparency black), and keeping
 * next/image out of this module lets `product-panel`'s category data be
 * imported by server-side tests.
 */
export function CutoutPicture({ image, children }: { image: MerchImage; children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{children}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      alt={image.alt}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 size-full object-contain"
      onError={() => setFailed(true)}
    />
  );
}
