"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  MapPin,
  Menu,
  Search,
  ShoppingCart,
  User,
  X,
  Zap,
} from "lucide-react";
import { NAV_PRIMARY } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { useScrolled } from "@/hooks/use-scrolled";
import { cn } from "@/lib/utils";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-1.5" aria-label="Vertical Express home">
      <span className="grid size-9 place-items-center rounded-lg bg-brand">
        <Zap className="size-5 fill-ink text-ink" aria-hidden />
      </span>
      <span className="text-xl font-extrabold tracking-tight sm:text-2xl">
        Vertical<span className="text-brand-deep">Express</span>
      </span>
    </Link>
  );
}

function PincodeChip() {
  const [pincode, setPincode] = useState("190001");
  const [editing, setEditing] = useState(false);

  return (
    <div className="hidden items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 lg:flex">
      <MapPin className="size-4 shrink-0 text-brand-deep" aria-hidden />
      <div className="leading-tight">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
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
            className="w-16 border-b border-ink text-sm font-bold focus:outline-none"
            aria-label="Delivery pincode"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="cursor-pointer text-sm font-bold hover:text-brand-deep"
          >
            {pincode} — 60 min
          </button>
        )}
      </div>
    </div>
  );
}

export function Navbar() {
  const scrolled = useScrolled(12);
  const { count } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-white transition-shadow duration-300",
        scrolled && "shadow-header"
      )}
    >
      {/* Top row: logo / search / actions */}
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <button
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-surface lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-6" />
        </button>

        <Logo />

        <form
          role="search"
          className="relative hidden flex-1 md:block"
          onSubmit={(e) => e.preventDefault()}
        >
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search cement, wires, hinges, paint…"
            className="h-11 w-full rounded-full border border-neutral-200 bg-surface pl-11 pr-4 text-sm transition-all duration-200 placeholder:text-neutral-400 focus:border-brand focus:bg-white focus:shadow-card focus:outline-none"
            aria-label="Search products"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <PincodeChip />
          <button
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors hover:bg-surface"
            aria-label="Log in"
          >
            <User className="size-5" aria-hidden />
            <span className="hidden sm:inline">Login</span>
          </button>
          <button
            className="relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors hover:bg-surface"
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
          </button>
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
                  "flex items-center gap-1 rounded-md px-3 py-3 text-[13px] font-bold text-neutral-700 transition-colors hover:text-ink",
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
                    className="absolute left-0 top-full z-50 min-w-56 rounded-xl border border-neutral-100 bg-white p-2 shadow-card-hover"
                  >
                    {cat.children.map((child) => (
                      <Link
                        key={child.label}
                        href={child.href}
                        className="block rounded-lg px-3 py-2 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-surface hover:text-ink"
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

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-ink/50 lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col bg-white shadow-card-hover lg:hidden"
              aria-label="Mobile menu"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 p-4">
                <Logo />
                <button
                  className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-surface"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {NAV_PRIMARY.map((cat) => (
                  <div key={cat.label} className="mb-4">
                    <Link
                      href={cat.href}
                      onClick={() => setMobileOpen(false)}
                      className="text-sm font-extrabold uppercase tracking-wide"
                    >
                      {cat.label}
                    </Link>
                    {cat.children && (
                      <ul className="mt-2 space-y-1 border-l-2 border-brand/40 pl-3">
                        {cat.children.map((child) => (
                          <li key={child.label}>
                            <Link
                              href={child.href}
                              onClick={() => setMobileOpen(false)}
                              className="block py-1 text-sm font-semibold text-neutral-600 hover:text-ink"
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
