"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import type { CatalogFacets } from "@/lib/services/catalog";
import { FilterSidebar } from "@/components/shop/filter-sidebar";

/** Mobile bottom-sheet wrapper around the shared FilterSidebar. */
export function FilterSheet({ facets, activeCount }: { facets: CatalogFacets; activeCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-bold transition-colors hover:border-ink lg:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {activeCount > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-ink">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-ink/50 lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close filters"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-card-hover lg:hidden"
              role="dialog"
              aria-label="Filters"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-extrabold">Filters</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-surface"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>
              <FilterSidebar facets={facets} />
              <button
                onClick={() => setOpen(false)}
                className="mt-6 w-full cursor-pointer rounded-lg bg-ink py-3 text-sm font-extrabold uppercase tracking-widest text-white"
              >
                Show results
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
