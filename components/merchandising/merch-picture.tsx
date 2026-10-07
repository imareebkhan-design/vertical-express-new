"use client";

import { useState } from "react";
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
}: {
  image: MerchImage;
  sizes: string;
  priority?: boolean;
  className?: string;
  fallback?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span role="img" aria-label={image.alt} className="absolute inset-0" style={{ background: fallback }} />;
  }
  return (
    <Image
      src={image.src}
      alt={image.alt}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
      style={{ objectPosition: image.focal ?? "50% 50%" }}
      onError={() => setFailed(true)}
    />
  );
}
