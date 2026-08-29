"use client";

import { SERVICE_FEATURES } from "@/lib/services";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";

export function WhyChoose() {
  return (
    <section aria-label="Why choose Vertical Express" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Why Choose Vertical Express
          </h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            One platform for everything your build needs
          </p>
        </Reveal>

        <Stagger
          stagger={0.07}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SERVICE_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <StaggerItem key={feature.title}>
                <div className="group flex h-full items-start gap-4 rounded-card border border-neutral-100 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover sm:p-6">
                  <span className="grid size-12 shrink-0 place-items-center rounded-panel bg-brand/15 transition-transform duration-300 ease-[var(--ease-brand)] group-hover:scale-110 group-hover:bg-brand/25">
                    <Icon className="size-6 text-brand-deep" strokeWidth={1.8} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold">{feature.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-neutral-500">
                      {feature.caption}
                    </p>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
