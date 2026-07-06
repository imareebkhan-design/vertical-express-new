import type { LucideIcon } from "lucide-react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaceholderImageProps {
  label: string;
  icon?: LucideIcon;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
}

/**
 * Stand-in for proprietary imagery from the original site.
 * Keeps the same dimensions/visual weight so real assets can drop in later.
 */
export function PlaceholderImage({
  label,
  icon: Icon = ImageIcon,
  className,
  iconClassName,
  showLabel = false,
}: PlaceholderImageProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-surface via-white to-surface",
        className
      )}
    >
      <Icon
        className={cn("size-10 text-neutral-300", iconClassName)}
        strokeWidth={1.5}
        aria-hidden
      />
      {showLabel && (
        <span className="px-3 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {label}
        </span>
      )}
    </div>
  );
}
