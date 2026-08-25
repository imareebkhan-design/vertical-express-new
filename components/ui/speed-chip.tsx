import * as React from "react";
import { Zap, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Delivery speed, shown on the product — never in the header.
 *
 * The header cannot know whether you are looking at a coil of wire or a tonne of
 * cement, so a single site-wide "60 min" badge is a promise that contradicts
 * itself as soon as a heavy item is on screen. Speed belongs to the goods.
 *
 * WHAT THIS COMPONENT WILL AND WILL NOT CLAIM
 *
 * The design system defines four states: express, scheduled, lead-time and
 * seasonal. Only the first two are rendered today, because only they are backed
 * by data:
 *
 *   - `Category.isBulk` distinguishes heavy material from small goods.
 *   - `ServiceablePincode.etaMinutes` gives the express window per pincode.
 *
 * `lead-time` (2–3 days) and `seasonal` (5–7 days, winter supply from Jammu)
 * need a per-variant `speedClass` that does not exist in the schema yet, so they
 * are typed here but never emitted. The variants are defined now so that adding
 * the column later is a data change, not a component rewrite.
 *
 * Equally, the scheduled state deliberately carries NO time. Slot selection and
 * the Shipment model do not exist yet — an order is still one order with one
 * ETA — so naming a delivery window here would be inventing a promise the
 * backend cannot keep. It says how the goods travel, which is true today.
 */
export type SpeedClass = "express" | "scheduled" | "leadtime" | "seasonal";

/** Derives the speed class from the data the catalogue actually carries. */
export function speedClassFor(isBulk: boolean): SpeedClass {
  return isBulk ? "scheduled" : "express";
}

const styles: Record<SpeedClass, string> = {
  express: "bg-ink text-white",
  scheduled: "bg-chip text-ink",
  leadtime: "bg-hush text-ink-500",
  seasonal: "bg-amber-soft text-ink",
};

export interface SpeedChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  speed: SpeedClass;
  /** Express window in minutes, from ServiceablePincode. */
  etaMinutes?: number;
  size?: "sm" | "md";
}

export function SpeedChip({
  speed,
  etaMinutes = 60,
  size = "sm",
  className,
  ...props
}: SpeedChipProps) {
  const label =
    speed === "express"
      ? `${etaMinutes} min`
      : speed === "scheduled"
        ? "Heavy — by truck"
        : speed === "leadtime"
          ? "2–3 days"
          : "Seasonal";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap",
        size === "sm" ? "h-[22px] px-2 text-[10.5px]" : "h-7 px-3 text-xs",
        styles[speed],
        className
      )}
      {...props}
    >
      {speed === "express" ? (
        <Zap className="size-3 fill-brand text-brand" aria-hidden />
      ) : (
        <Truck className="size-3" aria-hidden />
      )}
      {label}
    </span>
  );
}
