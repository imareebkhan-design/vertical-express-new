"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Grid, ShoppingCart, Package, User } from "lucide-react";
import { MAIN_TABS } from "@/types/mobile-navigation";
import { triggerHaptic } from "@/lib/native/haptics";
import { useCart } from "@/hooks/use-cart";

const ICON_MAP = {
  home: Home,
  grid: Grid,
  "shopping-cart": ShoppingCart,
  orders: Package,
  user: User,
};

/**
 * The floating pill nav from the app design.
 *
 * Inactive tabs are icon-only circles on a soft grey fill; the active tab
 * expands into an ink pill carrying its label, so exactly one word shows at a
 * time. The cart badge is amber on ink — never red, which the customer surface
 * does not use.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { count: cartCount } = useCart();

  return (
    <nav
      /* The wrapping <footer> is already fixed to the bottom; this insets from
         it — 14px each side, 20px clear of the home indicator. */
      className="native-tabbar mx-3.5 flex h-16 items-center justify-between rounded-full bg-paper px-[11px] shadow-[0_12px_34px_rgba(17,17,17,0.08),0_2px_6px_rgba(17,17,17,0.04)]"
      style={{ marginBottom: "max(20px, env(safe-area-inset-bottom, 20px))" }}
    >
      {MAIN_TABS.map((tab) => {
        const Icon = ICON_MAP[tab.iconName];
        const isActive =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.id}
            href={tab.href}
            onClick={() => triggerHaptic("light")}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "flex h-11 items-center gap-[7px] rounded-full bg-ink px-[15px] text-[12.5px] font-bold tracking-[-0.01em] text-white no-underline"
                : "relative flex size-[42px] items-center justify-center rounded-full bg-chip-soft text-ink no-underline"
            }
          >
            <Icon
              className={isActive ? "size-[17px]" : "size-[19px]"}
              strokeWidth={isActive ? 2 : 1.7}
              aria-hidden
            />
            {isActive && <span>{tab.label}</span>}

            {tab.id === "cart" && cartCount > 0 && (
              <span
                className={`absolute flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-amber px-[5px] text-[10.5px] font-extrabold tabular-nums text-ink ${
                  isActive ? "-right-1 -top-1" : "-right-px -top-px"
                }`}
              >
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
