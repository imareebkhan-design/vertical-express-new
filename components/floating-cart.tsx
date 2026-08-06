"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatPaise } from "@/lib/money";

/** Floating "View cart" pill that appears once items are added. */
export function FloatingCart() {
  const { count, summary } = useCart();

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="fixed inset-x-4 bottom-24 z-40 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-80"
        >
          <Link
            href="/cart"
            className="flex w-full cursor-pointer items-center justify-between rounded-2xl bg-ink px-5 py-4 text-white shadow-card-hover transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="flex items-center gap-3">
              <span className="relative">
                <ShoppingCart className="size-5" aria-hidden />
                <motion.span
                  key={count}
                  initial={{ scale: 1.6 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-ink"
                >
                  {count}
                </motion.span>
              </span>
              <span className="text-sm font-extrabold">View cart</span>
            </span>
            <span className="text-sm font-extrabold text-brand">
              {formatPaise(summary.subtotalPaise)}
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
