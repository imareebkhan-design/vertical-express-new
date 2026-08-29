"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Grid, Search, ShoppingCart, User } from "lucide-react";
import { motion } from "framer-motion";
import { MAIN_TABS } from "@/types/mobile-navigation";
import { triggerHaptic } from "@/lib/native/haptics";
import { useCart } from "@/hooks/use-cart";

const ICON_MAP = {
  home: Home,
  grid: Grid,
  search: Search,
  "shopping-cart": ShoppingCart,
  user: User,
};

/**
 * MobileTabBar — 5-tab mobile bottom navigation bar with haptic feedback,
 * animated Framer Motion transitions, active indicator, and safe-area inset support.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { count: cartCount } = useCart();

  const handleTabClick = () => {
    triggerHaptic("light");
  };

  return (
    <nav className="native-tabbar fixed bottom-0 left-0 right-0 z-40 border-t border-mist/20 bg-surface/95 px-2 pb-[env(safe-area-inset-bottom,12px)] pt-2.5 backdrop-blur-md shadow-[0_-4px_16px_rgba(17,17,17,0.06)]">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {MAIN_TABS.map((tab) => {
          const Icon = ICON_MAP[tab.iconName];
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={handleTabClick}
              className={`relative flex flex-col items-center justify-center py-1 px-3 transition-colors ${
                isActive ? "text-brand-deep font-bold" : "text-ink/50 hover:text-ink"
              }`}
              style={{ minWidth: "64px", minHeight: "44px" }}
              aria-label={tab.label}
            >
              <motion.div
                animate={{ scale: isActive ? 1.15 : 1, y: isActive ? -1 : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="relative flex flex-col items-center"
              >
                <Icon className={`size-5 transition-colors ${isActive ? "text-brand-deep" : "text-ink/60"}`} />
                
                {tab.id === "cart" && cartCount > 0 && (
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white ring-2 ring-surface"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </motion.span>
                )}

                <span className="mt-1 text-[10px] tracking-tight leading-none">{tab.label}</span>
                
                {/* Active Indicator Dot */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabDot"
                    className="absolute -bottom-2 size-1.5 rounded-full bg-brand-deep"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
