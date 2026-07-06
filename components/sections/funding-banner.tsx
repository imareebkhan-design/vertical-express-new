"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { Rocket, TrendingUp } from "lucide-react";
import { Reveal } from "@/components/reveal";

/**
 * Recreates the funding announcement banner with a subtle scroll parallax.
 * Original artwork replaced with a styled placeholder composition.
 */
export function FundingBanner() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-40, 40]);

  return (
    <section aria-label="Company milestone" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Reveal>
        <div
          ref={ref}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy via-navy to-ink px-6 py-12 text-white sm:px-12 sm:py-16"
        >
          <motion.div
            style={{ y }}
            className="pointer-events-none absolute -right-8 top-1/2 -translate-y-1/2 opacity-15"
            aria-hidden
          >
            <TrendingUp className="size-56 sm:size-72" strokeWidth={0.8} />
          </motion.div>

          <div className="relative max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-ink">
              <Rocket className="size-3.5" aria-hidden /> Milestone
            </p>
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              We&apos;ve raised our Series A to build the future of construction commerce
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold text-white/70 sm:text-base">
              Backed by leading investors, we&apos;re expanding faster delivery, deeper
              inventory, and better prices across Srinagar — and beyond.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
