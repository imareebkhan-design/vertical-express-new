import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-all duration-200 ease-[var(--ease-brand)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] cursor-pointer",
  {
    variants: {
      variant: {
        // Near-black is the primary action. Amber is an accent, not a CTA — it
        // cannot carry white text and reads as decoration when it carries every
        // button on the page.
        primary: "bg-ink text-white hover:bg-ink/90 hover:shadow-card-hover",
        // Amber fill with ink text. For the rare emphasised action on a dark
        // panel, where ink-on-ink would disappear.
        accent: "bg-brand text-ink shadow-card hover:bg-brand-dark hover:shadow-card-hover",
        // Secondary. A tint fill rather than a stroke — the system has no hard
        // 1px borders.
        secondary: "bg-chip text-ink hover:bg-hush",
        outline: "bg-chip text-ink hover:bg-hush",
        ghost: "bg-transparent text-ink hover:bg-surface",
        /** @deprecated identical to `primary`; kept so existing usages compile. */
        dark: "bg-ink text-white hover:bg-ink/90",
      },
      size: {
        sm: "h-9 rounded-full px-4 text-xs",
        md: "h-11 rounded-full px-6 text-sm",
        lg: "h-13 rounded-full px-8 text-base",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
