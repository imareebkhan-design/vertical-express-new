"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "vertical-express-popup-dismissed";

/** One-time promo popup, mirroring the original site's custom popup section. */
export function WelcomePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setOpen(true), 2800);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setOpen(false);
    sessionStorage.setItem(STORAGE_KEY, "1");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-4 backdrop-blur-sm"
          onClick={dismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Welcome offer"
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 16, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-card-hover"
          >
            <button
              onClick={dismiss}
              aria-label="Close popup"
              className="absolute right-3 top-3 z-10 grid size-8 cursor-pointer place-items-center rounded-full bg-white/80 backdrop-blur transition-transform hover:scale-110"
            >
              <X className="size-4" />
            </button>

            {/* Placeholder for original promo artwork */}
            <div className="flex flex-col items-center bg-gradient-to-br from-brand to-brand-dark px-6 pb-6 pt-10 text-center">
              <Truck className="mb-3 size-12 text-ink" strokeWidth={1.4} aria-hidden />
              <p className="text-xs font-extrabold uppercase tracking-widest text-ink/60">
                New here?
              </p>
              <h2 className="mt-1 text-2xl font-extrabold leading-tight text-ink">
                Free delivery on your first 3 orders above ₹500
              </h2>
            </div>
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-neutral-500">
                Superfast 60-minute delivery across Srinagar. 8am to 8pm, all days.
              </p>
              <Button size="lg" className="mt-4 w-full" onClick={dismiss}>
                Start shopping
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
