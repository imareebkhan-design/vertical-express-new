"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { HardHat, PaintRoller, PencilRuler, Plug, ShowerHead, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/magnetic";
import { Reveal } from "@/components/reveal";

const FLOATING_ICONS = [
  { icon: PencilRuler, className: "left-[8%] top-[18%]", delay: 0 },
  { icon: ShowerHead, className: "left-[20%] bottom-[15%]", delay: 1.2 },
  { icon: Plug, className: "right-[22%] top-[15%]", delay: 0.6 },
  { icon: PaintRoller, className: "right-[8%] bottom-[20%]", delay: 1.8 },
  { icon: Wrench, className: "left-[45%] top-[10%]", delay: 2.4 },
];

/** Homepage banner introducing the Services platform, shown before the footer. */
export function ServicesPromo() {
  const reduced = useReducedMotion();

  return (
    <section aria-label="Professional services" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink via-neutral-900 to-navy px-6 py-14 text-center text-white sm:px-12 sm:py-16">
          {/* Subtle background animation: drifting glow + floating trade icons */}
          <motion.div
            aria-hidden
            animate={reduced ? {} : { x: ["-10%", "10%", "-10%"], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -top-1/2 left-1/4 size-[32rem] rounded-full bg-brand/15 blur-3xl"
          />
          {FLOATING_ICONS.map(({ icon: Icon, className, delay }) => (
            <motion.span
              key={className}
              aria-hidden
              animate={reduced ? {} : { y: [0, -12, 0], opacity: [0.15, 0.3, 0.15] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay }}
              className={`pointer-events-none absolute hidden text-brand md:block ${className}`}
            >
              <Icon className="size-8" strokeWidth={1.4} />
            </motion.span>
          ))}

          <div className="relative mx-auto max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-ink">
              <HardHat className="size-3.5" aria-hidden /> New: Services
            </p>
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              Need Professionals for Your Project?
            </h2>
            <p className="mt-3 text-sm font-semibold text-white/70 sm:text-base">
              From architects and engineers to plumbers, electricians, painters,
              carpenters, and complete home construction—we&apos;ve got you covered.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Magnetic>
                <Link href="/services">
                  <Button size="lg">Explore Services</Button>
                </Link>
              </Magnetic>
              <Magnetic>
                <Link href="/services#service-categories">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white text-white hover:bg-white hover:text-ink"
                  >
                    Book Consultation
                  </Button>
                </Link>
              </Magnetic>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
