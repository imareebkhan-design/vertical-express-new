"use client";

import { CATEGORIES } from "@/lib/data";
import { CategoryCard } from "@/components/category-card";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";

export function Categories() {
  return (
    <section id="categories" className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Top Categories
          </h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            Everything your site needs, one hour away
          </p>
        </Reveal>

        <Stagger
          stagger={0.04}
          className="grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-5 md:grid-cols-4 lg:grid-cols-6"
        >
          {CATEGORIES.map((cat) => (
            <StaggerItem key={cat.slug}>
              <CategoryCard category={cat} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
