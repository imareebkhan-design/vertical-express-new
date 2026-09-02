"use client";

import { SERVICE_CATEGORIES } from "@/lib/services";
import { ServiceCard } from "@/components/service-card";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";

export function ServiceCategoriesSection() {
  return (
    <section id="service-categories" className="bg-surface/60 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Service Categories
          </h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            Every trade, one trusted platform
          </p>
        </Reveal>

        <Stagger
          stagger={0.04}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {SERVICE_CATEGORIES?.map((service) => (
            <StaggerItem key={service?.slug} className="h-full">
              <ServiceCard service={service} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
