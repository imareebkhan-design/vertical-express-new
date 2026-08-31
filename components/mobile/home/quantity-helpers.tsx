"use client";

import Link from "next/link";
import { Layers, PaintBucket, Package } from "lucide-react";
import { triggerHaptic } from "@/lib/native/haptics";

/**
 * "How much do I need?" — the calculator entry strip from the homeowner home.
 *
 * WHAT THIS IS AND IS NOT
 *
 * The app canvas has no calculator screen. It has these three cards and nothing
 * behind them, so the strip is the whole design element for this artboard —
 * building the calculator itself would mean inventing a screen the designer did
 * not draw, on top of coverage rates nobody has confirmed. The construction
 * calculator is P1 in CLAUDE.md and stays there.
 *
 * So the cards lead to the material they are about. Somebody who does not know
 * how much paint a room takes is still better served landing in Painting than
 * on a dead card, and when the calculator is designed the hrefs change and the
 * strip does not.
 *
 * The subcopy is trade convention rather than business rule — two coats, ten
 * percent tiling wastage — so it carries no placeholder marker. That rule is
 * for money, time, limits and terms.
 */
const HELPERS = [
  {
    href: "/category/painting",
    title: "Paint for a room",
    note: "Walls + ceiling, 2 coats",
    Icon: PaintBucket,
  },
  {
    href: "/category/tiling",
    title: "Tiles for a floor",
    note: "Boxes, with 10% wastage",
    Icon: Layers,
  },
  {
    href: "/category/cement",
    title: "Cement for plaster",
    note: null,
    Icon: Package,
  },
] as const;

export function QuantityHelpers() {
  return (
    <section aria-labelledby="quantity-helpers" className="pt-[18px]">
      <div className="px-4">
        <h2
          id="quantity-helpers"
          className="text-[17px] font-extrabold tracking-[-0.02em] text-ink"
        >
          How much do I need?
        </h2>
        <p className="mt-[3px] text-[12px] font-semibold text-ink-500">
          Rough quantities from a room size. Not a quote.
        </p>
      </div>

      {/* Horizontal scroller — the artboard shows the third card clipped. */}
      <div className="mt-[11px] flex gap-[9px] overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {HELPERS.map(({ href, title, note, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => triggerHaptic("light")}
            className="flex w-[150px] flex-none flex-col gap-[9px] rounded-[20px] bg-amber-soft p-[13px] active:opacity-90"
          >
            <Icon className="size-[26px] text-ink/65" strokeWidth={1.5} aria-hidden />
            <span className="text-[14px] font-bold leading-[18px] text-ink">{title}</span>
            {note && <span className="text-[12px] font-semibold text-ink-700">{note}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
