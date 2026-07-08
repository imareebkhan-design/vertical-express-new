"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { ServiceCategory } from "@/lib/services";
import { BookingModal } from "@/components/services/booking-modal";

/**
 * Reusable service tile. "Book now" opens a real booking request modal
 * (submitBooking action). `slug` also maps to the DB service record.
 */
export function ServiceCard({ service }: { service: ServiceCategory }) {
  const Icon = service.icon;
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.article
        whileHover={{ y: -6 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={() => setOpen(true)}
        className="group flex h-full cursor-pointer flex-col rounded-card border border-neutral-100 bg-white p-5 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-6"
      >
        <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-tile transition-transform duration-300 ease-[var(--ease-brand)] group-hover:scale-110">
          <Icon className="size-7 text-neutral-700" strokeWidth={1.6} aria-hidden />
        </span>

        <h3 className="text-base font-extrabold leading-snug">{service.name}</h3>
        <p className="mt-1 text-sm font-semibold text-neutral-500">{service.blurb}</p>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {service.items.map((item) => (
            <li key={item} className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-bold text-neutral-600">
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="mt-auto flex cursor-pointer items-center gap-1 pt-4 text-xs font-extrabold uppercase tracking-widest text-brand-deep"
        >
          Book now
          <ArrowRight
            className="size-3.5 transition-transform duration-300 ease-[var(--ease-brand)] group-hover:translate-x-1"
            aria-hidden
          />
        </button>
      </motion.article>

      <BookingModal
        open={open}
        onClose={() => setOpen(false)}
        serviceSlug={service.slug}
        serviceName={service.name}
      />
    </>
  );
}
