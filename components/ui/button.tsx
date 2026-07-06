import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-all duration-200 ease-[var(--ease-brand)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-ink shadow-card hover:bg-brand-dark hover:shadow-card-hover",
        dark: "bg-ink text-white hover:bg-neutral-800",
        outline:
          "border-2 border-ink bg-transparent text-ink hover:bg-ink hover:text-white",
        ghost: "bg-transparent text-ink hover:bg-surface",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs uppercase tracking-wide",
        md: "h-10 rounded-lg px-5 text-sm",
        lg: "h-12 rounded-lg px-7 text-base",
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
