import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide",
  {
    variants: {
      variant: {
        deal: "bg-brand text-ink",
        dark: "bg-ink text-white",
        outline: "border border-ink text-ink",
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
