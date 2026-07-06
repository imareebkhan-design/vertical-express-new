"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { SERVICE_PACKAGES, type ServicePackage } from "@/lib/services";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { cn } from "@/lib/utils";

const themeClasses: Record<ServicePackage["theme"], { card: string; chip: string }> = {
  yellow: {
    card: "bg-gradient-to-br from-brand to-brand-dark text-ink",
    chip: "bg-ink/10 text-ink",
  },
  navy: {
    card: "bg-gradient-to-br from-navy to-ink text-white",
    chip: "bg-white/10 text-white",
  },
  light: {
    card: "bg-gradient-to-br from-surface via-white to-tile text-ink border border-neutral-100",
    chip: "bg-white text-neutral-600 shadow-card",
  },
};

function PackageCard({ pkg }: { pkg: ServicePackage }) {
  const Icon = pkg.icon;
  const theme = themeClasses[pkg.theme];

  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex h-full w-[85vw] max-w-md shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:w-[420px] sm:p-8",
        theme.card
      )}
    >
      <div>
        <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-white/60 shadow-card backdrop-blur-sm">
          <Icon className="size-7 text-ink" strokeWidth={1.6} aria-hidden />
        </span>
        <h3 className="text-xl font-extrabold leading-tight sm:text-2xl">{pkg.name}</h3>
        <p className="mt-2 text-sm font-semibold opacity-75">{pkg.blurb}</p>
      </div>

      <div className="mt-6">
        <ul className="mb-5 space-y-1.5">
          {pkg.highlights.map((point) => (
            <li key={point} className="flex items-center gap-2 text-sm font-bold">
              <Check className="size-4 shrink-0 opacity-70" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest">
          Get this package
          <ArrowRight
            className="size-4 transition-transform duration-300 ease-[var(--ease-brand)] group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </div>
    </motion.article>
  );
}

export function FeaturedServices() {
  return (
    <section aria-label="Featured services" className="bg-surface/60 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-8">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Featured Services
          </h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            Ready-made packages for the most requested projects
          </p>
        </Reveal>

        <Stagger stagger={0.08}>
          <div className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {SERVICE_PACKAGES.map((pkg) => (
              <StaggerItem key={pkg.slug} className="flex h-full shrink-0">
                <PackageCard pkg={pkg} />
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      </div>
    </section>
  );
}
