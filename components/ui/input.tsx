import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // A soft fill rather than a stroke. Focus is an ink ring: amber against the
        // warm canvas is ~1.9:1 and would not meet the 3:1 a focus indicator needs.
        "flex h-12 w-full rounded-field bg-chip-soft px-4 text-sm font-medium text-ink placeholder:text-ink-500 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
