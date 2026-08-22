"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ANNOUNCEMENTS } from "@/lib/data";

/** Black strip above the header cycling through store messages. */
export function AnnouncementBar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % ANNOUNCEMENTS?.length),
      3500
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="relative z-50 flex h-9 items-center justify-center overflow-hidden bg-ink text-white"
      role="region"
      aria-label="Store announcements"
    >
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="px-4 text-center text-xs font-bold tracking-wide sm:text-[13px]"
        >
          {ANNOUNCEMENTS?.[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
