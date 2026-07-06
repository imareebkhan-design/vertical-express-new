"use client";

import { Banknote, ShieldCheck, Star } from "lucide-react";
import { TRUST_ITEMS } from "@/lib/data";
import { Stagger, StaggerItem } from "@/components/reveal";

const ICONS = {
  star: Star,
  shield: ShieldCheck,
  banknote: Banknote,
} as const;

export function TrustBadges() {
  return (
    <section aria-label="Why shop with Vertical Express" className="bg-surface/60 py-10 sm:py-14">
      <Stagger
        stagger={0.12}
        className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 sm:grid-cols-3 sm:px-6"
      >
        {TRUST_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <StaggerItem key={item.title}>
              <div className="group flex flex-col items-center rounded-card p-6 text-center transition-colors duration-300 hover:bg-white hover:shadow-card">
                <span className="mb-4 grid size-16 place-items-center rounded-full bg-brand/15 transition-transform duration-300 ease-[var(--ease-brand)] group-hover:scale-110 group-hover:bg-brand/25">
                  <Icon className="size-8 text-brand-deep" strokeWidth={1.8} aria-hidden />
                </span>
                <h3 className="text-base font-extrabold">{item.title}</h3>
                <p className="mt-1 text-sm font-semibold text-neutral-500">{item.caption}</p>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}
