"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import { SERVICE_STEPS } from "@/lib/services";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";

export function HowItWorks() {
  return (
    <section aria-label="How it works" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-10 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            How It Works
          </h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            From first call to final handover in four steps
          </p>
        </Reveal>

        <Stagger
          stagger={0.15}
          className="flex flex-col items-center gap-2 lg:flex-row lg:items-stretch lg:justify-center"
        >
          {SERVICE_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === SERVICE_STEPS.length - 1;
            return (
              <StaggerItem key={step.step} className="flex flex-col items-center lg:flex-row">
                <div className="group relative flex w-64 flex-col items-center rounded-card border border-neutral-100 bg-white p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover">
                  <span className="absolute -top-3 grid size-7 place-items-center rounded-full bg-ink text-xs font-extrabold text-brand">
                    {step.step}
                  </span>
                  <span className="mb-3 mt-2 grid size-14 place-items-center rounded-2xl bg-brand/15 transition-transform duration-300 ease-[var(--ease-brand)] group-hover:scale-110">
                    <Icon className="size-7 text-brand-deep" strokeWidth={1.7} aria-hidden />
                  </span>
                  <h3 className="text-sm font-extrabold">{step.title}</h3>
                  <p className="mt-1 text-xs font-semibold text-neutral-500">
                    {step.caption}
                  </p>
                </div>

                {!isLast && (
                  <span aria-hidden className="p-2 text-neutral-300">
                    <ArrowDown className="size-5 lg:hidden" />
                    <ArrowRight className="hidden size-5 lg:block" />
                  </span>
                )}
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
