"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  MapPin,
  ShoppingCart,
  Search,
  ExternalLink,
  LayoutGrid,
} from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useScrolled } from "@/hooks/use-scrolled";
import { SearchBox } from "@/components/shop/search-box";
import { AccountButton } from "@/components/auth/account-button";
import { formatINR, cn } from "@/lib/utils";

const L1_GROUPS = [
  {
    label: "Civil & Interiors",
    href: "/category/cement",
    items: [
      { label: "Cement", href: "/category/cement" },
      { label: "Tiling", href: "/category/tiling" },
      { label: "Painting", href: "/category/painting" },
      { label: "Waterproofing", href: "/category/waterproofing" },
      { label: "Plywood, MDF & HDHMR", href: "/category/plywood-mdf-hdhmr" },
      { label: "Adhesives & Sealants", href: "/category/fevicol" },
    ],
  },
  {
    label: "Furniture & Hardware",
    href: "/category/general-hardware-tools",
    items: [
      { label: "Hinges, Channels & Handles", href: "/category/hinges-channels-handles" },
      { label: "Kitchen Systems", href: "/category/kitchen-systems-accessories" },
      { label: "Wardrobe & Bed Fittings", href: "/category/wardrobe-bed-fittings" },
      { label: "Door Locks & Hardware", href: "/category/door-locks-hardware" },
      { label: "General Hardware & Tools", href: "/category/general-hardware-tools" },
    ],
  },
  {
    label: "Electrical",
    href: "/category/wires-mcb-distribution-boards",
    items: [
      { label: "Wires, MCB & Distribution", href: "/category/wires-mcb-distribution-boards" },
      { label: "Switches & Sockets", href: "/category/switches-sockets" },
      { label: "Conduits & GI Boxes", href: "/category/conduits-gi-boxes" },
      { label: "Lighting", href: "/category/lighting" },
      { label: "Ceiling Fans & Exhaust", href: "/category/ceiling-fans-exhaust" },
    ],
  },
  {
    label: "Plumbing & Bath",
    href: "/category/cpvc-pipes-overhead-tanks",
    items: [
      { label: "CPVC Pipes & Overhead Tanks", href: "/category/cpvc-pipes-overhead-tanks" },
      { label: "Sanitary & Bath Fittings", href: "/category/sanitary-bath-fittings" },
      { label: "Kitchen Sinks & Faucets", href: "/category/kitchen-sinks-faucets" },
    ],
  },
];

export function Navbar() {
  const scrolled = useScrolled(16);
  const { count, summary } = useCart();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  /* The location sheet is the shell's (one instance for every page). */
  const { hasChosenLocation, locationLabel, openLocationModal } = useNativeShell();
  const pathname = usePathname();

  const totalDisplay = summary.subtotalPaise > 0
    ? formatINR(summary.subtotalPaise / 100)
    : "₹0";

  return (
    <header className="sticky top-0 z-40 bg-paper shadow-[0_1px_0_rgba(17,17,17,0.05)] transition-shadow">
      {/* =========================================================================
          DESKTOP HEADER (≥ 1024px)
          Row 1: Brand · Search · Site Chip · Account · Cart with running total
          ========================================================================= */}
      <div className="hidden lg:block">
        {/* ROW 1 */}
        <div className="mx-auto flex h-[74px] max-w-[1200px] items-center gap-[22px] px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-[11px] shrink-0 text-ink no-underline hover:opacity-90 transition-opacity">
            <Logo className="h-auto w-[170px]" />
          </Link>

          {/* Search Box (flex-1 full row expansion, widest element) */}
          <div className="flex-1 min-w-0">
            <SearchBox />
          </div>

          {/* Site Chip (Pincode + Area Only — No delivery speed promise in header) */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={openLocationModal}
              className="inline-flex h-11 max-w-[260px] items-center gap-2.5 rounded-full bg-paper px-4 text-left text-ink shadow-card hover:bg-hush transition-colors cursor-pointer"
            >
              <MapPin className="size-4 flex-none text-ink-500" aria-hidden />
              {hasChosenLocation ? (
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-500">Deliver to</span>
                  <span className="truncate text-[13px] font-bold">{locationLabel}</span>
                </span>
              ) : (
                <span className="text-[13px] font-bold">Where should we deliver?</span>
              )}
              <ChevronDown className="size-3.5 flex-none text-ink-500" aria-hidden />
            </button>
          </div>

          {/* Actions: Account + Cart */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Signed out this is a Sign in link; signed in it is the account
                menu. Previously it was an unconditional /account link, so a
                signed-out visitor clicking it was bounced to login with no
                indication they were not signed in. */}
            <AccountButton />

            <Link
              href="/cart"
              className="inline-flex h-11 items-center gap-2.5 rounded-full bg-ink px-4 text-white hover:bg-ink/90 transition-colors shadow-card"
              aria-label={`Cart, ${count} items, total ${totalDisplay}`}
            >
              <span className="relative flex items-center">
                <ShoppingCart className="size-4.5" />
                {count > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-ink tabular-nums">
                    {count}
                  </span>
                )}
              </span>
              <span className="text-[13.5px] font-bold tabular-nums">
                {totalDisplay}
              </span>
            </Link>
          </div>
        </div>

        {/* 1.5px Soft Rule */}
        <div className="h-[1.5px] bg-line" />

        {/* ROW 2: Category Nav (Collapses on Scroll) */}
        <AnimatePresence>
          {!scrolled && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 50, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-visible"
              aria-label="Category and secondary navigation"
            >
              <div className="mx-auto flex h-[50px] max-w-[1200px] items-center gap-[26px] px-6">
                {/* All 21 Categories Ink Pill */}
                <Link
                  href="/categories"
                  className={cn(
                    "inline-flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold tracking-[-0.01em] transition-colors",
                    pathname === "/categories"
                      ? "bg-ink text-white"
                      : "bg-chip text-ink hover:bg-ink hover:text-white"
                  )}
                >
                  <LayoutGrid className="size-3.5" aria-hidden />
                  <span>All categories</span>
                </Link>

                {/* 4 L1 Groups with Dropdowns */}
                {L1_GROUPS.map((group) => {
                  const isOpen = openGroup === group.label;
                  return (
                    <div
                      key={group.label}
                      className="relative"
                      onMouseEnter={() => setOpenGroup(group.label)}
                      onMouseLeave={() => setOpenGroup(null)}
                    >
                      <Link
                        href={group.href}
                        className={cn(
                          "inline-flex items-center gap-1 text-[13.5px] font-bold tracking-[-0.01em] text-ink-700 hover:text-ink transition-colors",
                          isOpen && "text-ink"
                        )}
                      >
                        <span>{group.label}</span>
                        <ChevronDown className="size-3 text-ink-300 transition-transform" aria-hidden />
                      </Link>

                      {/* Dropdown Menu */}
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-card border border-line bg-paper p-2 shadow-card-hover"
                          >
                            {group.items.map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className="block rounded-chip px-3 py-2 text-[13px] font-semibold text-ink-700 hover:bg-hush hover:text-ink transition-colors"
                              >
                                {item.label}
                              </Link>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Deals */}
                <Link
                  href="/#deals"
                  className="inline-flex items-center text-[13.5px] font-bold tracking-[-0.01em] text-ink-700 hover:text-ink transition-colors"
                >
                  Deals
                </Link>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Right link */}
                <Link
                  href="/services"
                  className="inline-flex items-center gap-1 text-[13.5px] font-bold tracking-[-0.01em] text-ink hover:text-ink-700 transition-colors"
                >
                  <span>Services</span>
                  <ExternalLink className="size-3.5 text-ink-500" aria-hidden />
                </Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>

      {/* =========================================================================
          MOBILE TOP APP BAR (< 1024px)
          ========================================================================= */}
      <div className="flex h-16 w-full items-center justify-between px-4 lg:hidden">
        {/* Left: Brand Icon + Title */}
        <Link href="/" className="flex items-center gap-2 text-ink no-underline">
          <Logo className="h-auto w-[140px]" />
        </Link>

        {/* Right: Search, Cart, Account */}
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="flex size-[38px] items-center justify-center rounded-full bg-paper shadow-card text-ink hover:bg-hush"
            aria-label="Search"
          >
            <Search className="size-4.5" />
          </Link>

          <Link
            href="/cart"
            className="relative flex size-[38px] items-center justify-center rounded-full bg-paper shadow-card text-ink hover:bg-hush"
            aria-label={`Cart, ${count} items`}
          >
            <ShoppingCart className="size-4.5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-ink tabular-nums">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
