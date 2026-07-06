"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { PackageSearch } from "lucide-react";
import type { Category } from "@/lib/data";

/**
 * Product-image category tile. Images live in /public/categories/<slug>.webp;
 * if one is missing, a clean placeholder keeps the layout intact.
 */
export function CategoryCard({ category }: { category: Category }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Link href={category.href} className="group block">
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col"
      >
        <div className="relative aspect-square overflow-hidden rounded-[22px] bg-tile shadow-none transition-shadow duration-300 group-hover:shadow-card-hover">
          {category.bulk && (
            <span className="absolute left-3 top-3 z-10 rounded-md bg-brand px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-ink shadow-card">
              Bulk Prices
            </span>
          )}

          {imageFailed ? (
            <div
              role="img"
              aria-label={category.name}
              className="flex size-full items-center justify-center"
            >
              <PackageSearch
                className="size-12 text-sky-900/20 sm:size-14"
                strokeWidth={1.4}
                aria-hidden
              />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- optional asset with runtime fallback
            <img
              src={`/categories/${category.slug}.webp`}
              alt={category.name}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="size-full object-contain p-5 transition-transform duration-300 ease-[var(--ease-brand)] group-hover:scale-105 sm:p-6"
            />
          )}
        </div>

        <h3 className="mt-3 text-center text-xs font-extrabold leading-snug sm:text-[13px]">
          {category.name}
        </h3>
      </motion.div>
    </Link>
  );
}
