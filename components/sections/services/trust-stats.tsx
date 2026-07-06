"use client";

import { SERVICE_STATS } from "@/lib/services";
import { AnimatedCounter } from "@/components/animated-counter";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";

export function TrustStats() {
  return (
    <section aria-label="Why customers trust us" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <div className="rounded-2xl bg-ink px-6 py-12 text-white sm:px-12">
            <h2 className="mb-10 text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
              Why Customers Trust Us
            </h2>
            <Stagger
              stagger={0.1}
              className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4"
            >
              {SERVICE_STATS.map((stat) => (
                <StaggerItem key={stat.label}>
                  <p className="text-4xl font-extrabold text-brand sm:text-5xl">
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                  </p>
                  <p className="mt-2 text-sm font-bold text-white/70">{stat.label}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
