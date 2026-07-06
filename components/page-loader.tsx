"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap } from "lucide-react";

/** Brand loading screen shown once on first paint, then reveals the page. */
export function PageLoader() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          exit={{ y: "-100%" }}
          transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
          className="fixed inset-0 z-[80] grid place-items-center bg-brand"
          aria-hidden
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2"
          >
            <motion.span
              animate={{ rotate: [0, -12, 12, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              className="grid size-12 place-items-center rounded-xl bg-ink"
            >
              <Zap className="size-7 fill-brand text-brand" />
            </motion.span>
            <span className="text-3xl font-extrabold tracking-tight text-ink">
              Vertical<span className="text-white">Express</span>
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
