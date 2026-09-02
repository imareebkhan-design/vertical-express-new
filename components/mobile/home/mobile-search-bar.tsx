"use client";

import React from "react";
import Link from "next/link";
import { Search, Mic, Scan } from "lucide-react";
import { triggerHaptic } from "@/lib/native/haptics";

/**
 * MobileSearchBar — tap-to-search input shortcut bar with voice and barcode
 * scanner placeholders.
 */
export function MobileSearchBar() {
  const handleTouch = () => {
    triggerHaptic("light");
  };

  return (
    <div className="px-4 py-2">
      <Link
        href="/search"
        onClick={handleTouch}
        className="flex items-center justify-between rounded-2xl border border-mist/40 bg-surface px-4 py-3 shadow-xs transition-colors hover:border-brand-deep/50"
      >
        <div className="flex items-center gap-3 text-ink/50">
          <Search className="size-4 text-brand-deep" />
          <span className="text-xs font-medium">Search cement, adhesives, tools...</span>
        </div>

        <div className="flex items-center gap-3 text-ink/40">
          <button
            type="button"
            onClick={(e) => {
              e?.preventDefault();
              handleTouch();
            }}
            className="hover:text-ink transition-colors"
            title="Voice Search"
          >
            <Mic className="size-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e?.preventDefault();
              handleTouch();
            }}
            className="hover:text-ink transition-colors"
            title="Scan Barcode"
          >
            <Scan className="size-4" />
          </button>
        </div>
      </Link>
    </div>
  );
}
