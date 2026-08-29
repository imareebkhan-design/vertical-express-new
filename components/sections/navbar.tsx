"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  MapPin,
  ShoppingCart,
  Store,
  LayoutGrid,
  Search,
  Package,
  User,
} from "lucide-react";
import { NAV_PRIMARY } from "@/lib/data";
import { AccountButton } from "@/components/auth/account-button";
import { SearchBox } from "@/components/shop/search-box";
import { useCart } from "@/hooks/use-cart";
import { useScrolled } from "@/hooks/use-scrolled";
import { cn } from "@/lib/utils";

import { Logo as BrandLogo } from "@/components/ui/logo";

function Logo() {
  return (
    <Link href="/" aria-label="Vertical Express home" className="hover:opacity-90 transition-opacity">
      <BrandLogo variant="horizontal" className="h-10 sm:h-12" />
    </Link>
  );
}

function PincodeChip() {
  const [pincode, setPincode] = useState("190001");
  const [editing, setEditing] = useState(false);

  return (
    <div className="hidden items-center gap-2 rounded-full bg-chip-soft px-4 py-1.5 lg:flex">
      <MapPin className="size-4 shrink-0 text-ink-500" aria-hidden />
      <div className="leading-tight">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
          Delivering to
        </p>
        {editing ? (
          <input
            autoFocus
            value={pincode}
            maxLength={6}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
            className="w-16 border-b border-ink bg-transparent text-sm font-bold focus:outline-none"
            aria-label="Delivery pincode"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="cursor-pointer text-sm font-bold hover:text-brand-deep"
          >
            {pincode}
          </button>
        )}
      </div>
    </div>
  );
}

export function Navbar() {
  const scrolled = useScrolled(12);
  const { count } = useCart();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const pathname = usePathname();
  const [editingPincode, setEditingPincode] = useState(false);
  const [pincode, setPincode] = useState("190001");

  // Determine active tab for mobile bottom nav
  const getActiveTab = () => {
    if (!pathname) return "";
    if (pathname === "/") return "shop";
    if (pathname.startsWith("/categories") || pathname.startsWith("/category")) return "categories";
    if (pathname.startsWith("/search")) return "search";
    if (pathname.startsWith("/account/orders")) return "orders";
    if (pathname.startsWith("/account")) return "account";
    return "";
  };

  const activeTab = getActiveTab();

  return (
    <>
      {/* Mobile TopAppBar (< 1024px) */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-16 w-full items-center justify-between border-b border-hairline-border bg-white/80 px-4 shadow-header backdrop-blur-md lg:hidden">
        {/* Left: Location Pin / Pincode editor */}
        <div className="flex items-center gap-1 min-w-[70px]">
          {editingPincode ? (
            <input
              autoFocus
              value={pincode}
              maxLength={6}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setEditingPincode(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingPincode(false)}
              className="w-16 border-b border-ink text-xs font-bold focus:outline-none bg-transparent"
              aria-label="Mobile delivery pincode"
            />
          ) : (
            <button
              onClick={() => setEditingPincode(true)}
              className="flex items-center gap-0.5 rounded-full bg-surface-soft px-2.5 py-1 text-xs font-bold text-ink transition-colors hover:bg-chip"
            >
              <MapPin className="size-3.5 text-ink" />
              <span>{pincode}</span>
            </button>
          )}
        </div>

        {/* Center: Brand Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Link href="/" className="text-center font-sans text-[15px] font-extrabold tracking-tighter text-ink uppercase">
            VERTICAL EXPRESS
          </Link>
        </div>

        {/* Right: Cart and Notifications/Account shortcuts */}
        <div className="flex items-center justify-end gap-1 min-w-[70px]">
          <Link
            href="/cart"
            className="relative p-2 text-ink transition-transform active:scale-95"
            aria-label={`Cart, ${count} items`}
          >
            <ShoppingCart className="size-5" />
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 grid size-4.5 place-items-center rounded-full bg-brand text-[9px] font-extrabold text-ink shadow-card">
                {count}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Desktop Navigation Header (>= 1024px) */}
      <header
        className={cn(
          "sticky top-0 z-40 hidden bg-white transition-shadow duration-300 lg:block",
          scrolled && "shadow-header"
        )}
      >
        {/* Top row: logo / search / actions */}
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Logo />
          <SearchBox className="hidden flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <PincodeChip />
            <AccountButton />
            <Link
              href="/cart"
              className="relative flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-colors hover:bg-surface"
              aria-label={`Cart, ${count} items`}
            >
              <ShoppingCart className="size-5" aria-hidden />
              <span className="hidden sm:inline">Cart</span>
              <AnimatePresence>
                {count > 0 && (
                  <motion.span
                    key={count}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-ink"
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          </div>
        </div>

        {/* Category nav row (desktop) */}
        <nav
          className="hidden border-t border-neutral-100 lg:block"
          aria-label="Primary navigation"
        >
          <ul className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-6">
            {NAV_PRIMARY.map((cat) => (
              <li
                key={cat.label}
                className="relative"
                onMouseEnter={() => setOpenMenu(cat.label)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <Link
                  href={cat.href}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-3 py-3 text-[13px] font-bold text-neutral-700 transition-colors hover:text-ink",
                    openMenu === cat.label && "text-ink"
                  )}
                >
                  {cat.label}
                  {cat.children && (
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform duration-200",
                        openMenu === cat.label && "rotate-180"
                      )}
                      aria-hidden
                    />
                  )}
                </Link>
                <span
                  className={cn(
                    "absolute inset-x-3 bottom-1 h-0.5 origin-left scale-x-0 rounded-full bg-brand transition-transform duration-300 ease-[var(--ease-brand)]",
                    openMenu === cat.label && "scale-x-100"
                  )}
                  aria-hidden
                />
                <AnimatePresence>
                  {cat.children && openMenu === cat.label && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="absolute left-0 top-full z-50 min-w-56 rounded-panel border border-line bg-white p-2 shadow-card-hover"
                    >
                      {cat.children.map((child) => (
                        <Link
                          key={child.label}
                          href={child.href}
                          className="block rounded-full px-3 py-2 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-surface hover:text-ink"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Mobile BottomNavBar (< 1024px) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-20 items-center justify-around border-t border-hairline-border bg-white/90 pb-safe shadow-[0_-4px_12px_rgba(17,17,17,0.08)] rounded-t-card-lg backdrop-blur-md lg:hidden">
        {/* Shop Tab */}
        <Link
          href="/"
          className={cn(
            "flex flex-col items-center justify-center text-neutral-500 transition-all duration-200 ease-out active:scale-90",
            activeTab === "shop" && "text-ink font-bold"
          )}
        >
          <Store className={cn("size-5.5 transition-colors", activeTab === "shop" && "text-ink")} />
          <span className="text-[10px] font-extrabold uppercase tracking-wide mt-1 font-sans">Shop</span>
        </Link>

        {/* Categories Tab */}
        <Link
          href="/categories"
          className={cn(
            "flex flex-col items-center justify-center text-neutral-500 transition-all duration-200 ease-out active:scale-90",
            activeTab === "categories" && "text-ink font-bold"
          )}
        >
          <LayoutGrid className={cn("size-5.5 transition-colors", activeTab === "categories" && "text-ink")} />
          <span className="text-[10px] font-extrabold uppercase tracking-wide mt-1 font-sans">Categories</span>
        </Link>

        {/* Search Tab */}
        <Link
          href="/search"
          className={cn(
            "flex flex-col items-center justify-center text-neutral-500 transition-all duration-200 ease-out active:scale-90",
            activeTab === "search" && "text-ink font-bold"
          )}
        >
          <Search className={cn("size-5.5 transition-colors", activeTab === "search" && "text-ink")} />
          <span className="text-[10px] font-extrabold uppercase tracking-wide mt-1 font-sans">Search</span>
        </Link>

        {/* Orders Tab */}
        <Link
          href="/account/orders"
          className={cn(
            "flex flex-col items-center justify-center text-neutral-500 transition-all duration-200 ease-out active:scale-90",
            activeTab === "orders" && "text-ink font-bold"
          )}
        >
          <Package className={cn("size-5.5 transition-colors", activeTab === "orders" && "text-ink")} />
          <span className="text-[10px] font-extrabold uppercase tracking-wide mt-1 font-sans">Orders</span>
        </Link>

        {/* Account Tab */}
        <Link
          href="/account"
          className={cn(
            "flex flex-col items-center justify-center text-neutral-500 transition-all duration-200 ease-out active:scale-90",
            activeTab === "account" && "text-ink font-bold"
          )}
        >
          <User className={cn("size-5.5 transition-colors", activeTab === "account" && "text-ink")} />
          <span className="text-[10px] font-extrabold uppercase tracking-wide mt-1 font-sans">Account</span>
        </Link>
      </nav>
    </>
  );
}
