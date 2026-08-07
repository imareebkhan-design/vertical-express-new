import Link from "next/link";
import { CalendarClock, Heart, MapPin, Package, UserRound, Wallet } from "lucide-react";

const ITEMS = [
  { href: "/account", label: "Overview", icon: UserRound },
  { href: "/account/orders", label: "My Orders", icon: Package },
  { href: "/account/wallet", label: "Wallet", icon: Wallet },
  { href: "/account/bookings", label: "Bookings", icon: CalendarClock },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
];

/** Shared side/top navigation for the account area. */
export function AccountNav({ active }: { active: string }) {
  return (
    <nav aria-label="Account" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = active === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              isActive ? "bg-brand-deep text-white" : "text-neutral-600 hover:bg-surface hover:text-ink"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
