"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/magnetic";
import { Reveal } from "@/components/reveal";

export function ServicesCTA() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-30, 30]);

  return (
    <section aria-label="Get started" className="mx-auto max-w-7xl px-4 py-6 pb-16 sm:px-6">
      <Reveal>
        <div
          ref={ref}
          className="relative overflow-hidden rounded-card-lg bg-gradient-to-br from-brand to-brand-dark px-6 py-14 text-center sm:px-12 sm:py-16"
        >
          <motion.div
            style={{ y }}
            className="pointer-events-none absolute -right-6 -top-6 opacity-10"
            aria-hidden
          >
            <HardHat className="size-56 sm:size-72" strokeWidth={0.8} />
          </motion.div>

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">
              Ready to Build Your Dream Home?
            </h2>
            <p className="mt-3 text-sm font-bold text-ink/70 sm:text-base">
              Talk to our experts today — site visits and consultations are free.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Magnetic>
                <Button size="lg" variant="dark">
                  Get Free Consultation
                </Button>
              </Magnetic>
              <Magnetic>
                <Button size="lg" variant="outline">
                  Request a Quote
                </Button>
              </Magnetic>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
