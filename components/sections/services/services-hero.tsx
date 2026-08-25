"use client";

import { motion, useReducedMotion } from "framer-motion";
import { HardHat, PencilRuler, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/magnetic";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
};

/** Blueprint-style placeholder visual standing in for a real illustration. */
function BlueprintCard() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: 2 }}
      animate={{ opacity: 1, y: 0, rotate: 2 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto hidden w-full max-w-sm md:block"
      aria-hidden
    >
      <motion.div
        animate={reduced ? {} : { y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="rounded-2xl border border-ink/10 bg-white p-5 shadow-card-hover"
      >
        {/* Blueprint grid */}
        <div className="relative mb-4 h-44 overflow-hidden rounded-xl bg-ink">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:22px_22px]" />
          <div className="absolute left-6 top-6 h-20 w-28 rounded border-2 border-brand/80" />
          <div className="absolute bottom-6 right-8 h-14 w-20 rounded border-2 border-white/50" />
          <div className="absolute left-16 top-14 h-9 w-14 rounded border border-dashed border-white/40" />
          <PencilRuler className="absolute bottom-4 left-6 size-6 text-brand" />
        </div>
        {/* Project progress rows */}
        {[
          { icon: PencilRuler, label: "Design approved", pct: "w-full" },
          { icon: HardHat, label: "Civil work", pct: "w-2/3" },
          { icon: Truck, label: "Materials on site", pct: "w-1/2" },
        ].map(({ icon: Icon, label, pct }) => (
          <div key={label} className="mb-3 flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tile">
              <Icon className="size-4 text-neutral-700" />
            </span>
            <div className="flex-1">
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
                {label}
              </p>
              <div className="h-1.5 rounded-full bg-surface">
                <div className={`h-full rounded-full bg-brand ${pct}`} />
              </div>
            </div>
          </div>
        ))}
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-white">
          <ShieldCheck className="size-4 text-brand" />
          <span className="text-xs font-extrabold">Quality checked at every stage</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ServicesHero() {
  return (
    <section
      aria-label="Construction services"
      className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface via-white to-tile px-6 py-14 sm:px-12 lg:px-16 lg:py-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <motion.div initial="hidden" animate="visible" variants={containerVariants}>
            <motion.p
              variants={itemVariants}
              className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-brand"
            >
              <HardHat className="size-3.5" aria-hidden /> Vertical Express Services
            </motion.p>
            <motion.h1
              variants={itemVariants}
              className="text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl"
            >
              Build Your Dream Home Without the Hassle
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className="mt-4 max-w-xl text-sm font-semibold text-neutral-600 sm:text-base"
            >
              From architectural planning to the final coat of paint, Vertical Express
              connects you with trusted professionals, verified contractors, skilled
              labor, and quality materials—all in one place.
            </motion.p>
            <motion.div variants={itemVariants} className="mt-7 flex flex-wrap gap-4">
              <Magnetic>
                <Button
                  size="lg"
                  onClick={() =>
                    document
                      .getElementById("service-categories")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Book a Service
                </Button>
              </Magnetic>
              <Magnetic>
                <Button size="lg" variant="outline">
                  Talk to an Expert
                </Button>
              </Magnetic>
            </motion.div>
          </motion.div>

          <BlueprintCard />
        </div>
      </div>
    </section>
  );
}
