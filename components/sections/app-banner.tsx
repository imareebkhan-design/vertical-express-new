"use client";

import { motion } from "framer-motion";
import { Apple, Play, Smartphone } from "lucide-react";
import { VerticalExpressIcon } from "@/components/ui/logo";
import { Reveal } from "@/components/reveal";
import { Magnetic } from "@/components/magnetic";

function StoreBadge({
  icon: Icon,
  topLine,
  bottomLine,
}: {
  icon: typeof Apple;
  topLine: string;
  bottomLine: string;
}) {
  return (
    <Magnetic strength={0.2}>
      <a
        href="#"
        className="flex items-center gap-3 rounded-xl bg-ink px-5 py-2.5 text-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0"
      >
        <Icon className="size-6" aria-hidden />
        <span className="leading-tight">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/70">
            {topLine}
          </span>
          <span className="block text-sm font-extrabold">{bottomLine}</span>
        </span>
      </a>
    </Magnetic>
  );
}

export function AppBanner() {
  return (
    <section aria-label="Download the app" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark px-6 py-12 sm:px-12">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-brand">
                <VerticalExpressIcon className="size-3.5" /> Vertical Express App
              </p>
              <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                Order materials on the go
              </h2>
              <p className="mt-3 max-w-md text-sm font-bold text-ink/70 sm:text-base">
                Track deliveries live, reorder in one tap, and unlock app-only offers.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <StoreBadge icon={Apple} topLine="Download on the" bottomLine="App Store" />
                <StoreBadge icon={Play} topLine="Get it on" bottomLine="Google Play" />
              </div>
            </div>

            {/* Phone mockup placeholder (replaces original app screenshot) */}
            <motion.div
              initial={{ opacity: 0, y: 40, rotate: -4 }}
              whileInView={{ opacity: 1, y: 0, rotate: -4 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto hidden w-52 md:block"
              aria-hidden
            >
              <div className="rounded-[2rem] border-8 border-ink bg-white p-3 shadow-card-hover">
                <div className="mb-2 h-24 rounded-xl bg-brand/30" />
                <div className="mb-2 h-3 w-3/4 rounded bg-neutral-200" />
                <div className="mb-4 h-3 w-1/2 rounded bg-neutral-200" />
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-lg bg-surface" />
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-ink py-2 text-white">
                  <Smartphone className="size-4" />
                  <span className="text-xs font-extrabold">60 min delivery</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
