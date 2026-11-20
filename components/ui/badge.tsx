import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold tracking-wide",
  {
    variants: {
      variant: {
        /** Discount and offer marks. Amber fill, ink text — never the reverse. */
        deal: "bg-brand text-ink",
        dark: "bg-ink text-white",
        /** Quiet metadata: pack size, grade, count. */
        soft: "bg-chip text-ink",
        /** Attention without alarm: low stock, seasonal. */
        attention: "bg-amber-soft text-ink",
        /** A tint fill rather than a stroke — the system has no hard borders. */
        outline: "bg-chip-soft text-ink-700",
      },
    },
    defaultVariants: { variant: "deal" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
