"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Play, Quote, Star } from "lucide-react";
import { TESTIMONIALS } from "@/lib/data";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";

/**
 * "Customers love Vertical Express" — video-reel style testimonial carousel.
 * Original customer videos replaced with styled reel placeholders.
 */
export function Testimonials() {
  const scroller = useRef<HTMLDivElement>(null);

  return (
    <section aria-label="Customer testimonials" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Customers love Vertical Express
          </h2>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-neutral-500">
            Rated <Star className="size-4 fill-brand text-brand" aria-hidden /> 4.9 on
            Google by builders across Srinagar
          </p>
        </Reveal>

        <Stagger stagger={0.09}>
          <div
            ref={scroller}
            className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:justify-center"
          >
            {TESTIMONIALS?.map((t) => (
              <StaggerItem key={t?.id} className="shrink-0 snap-start">
                <motion.figure
                  whileHover={{ y: -6 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative flex aspect-[9/16] w-48 flex-col justify-between overflow-hidden rounded-card bg-gradient-to-b from-neutral-800 to-ink p-4 text-white shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:w-56"
                >
                  {/* Reel placeholder texture */}
                  <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(239_196_26/0.25),transparent_55%)]"
                    aria-hidden
                  />

                  <Quote className="size-6 text-brand" aria-hidden />

                  <div className="relative">
                    <blockquote className="text-[13px] font-bold leading-snug">
                      “{t?.quote}”
                    </blockquote>
                    <figcaption className="mt-3">
                      <p className="text-xs font-extrabold text-brand">{t?.name}</p>
                      <p className="text-[11px] font-semibold text-white/60">{t?.role}</p>
                    </figcaption>
                  </div>

                  {/* Play affordance to mirror the original video reels */}
                  <button
                    className="absolute inset-0 grid cursor-pointer place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Play video testimonial from ${t?.name}`}
                  >
                    <span className="grid size-14 place-items-center rounded-full bg-brand text-ink shadow-card-hover transition-transform duration-300 group-hover:scale-110">
                      <Play className="size-6 fill-ink" aria-hidden />
                    </span>
                  </button>
                </motion.figure>
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      </div>
    </section>
  );
}
