"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { DirectoryGroup } from "@/lib/category-directory";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { PageLoader } from "@/components/page-loader";
import { CategoryTile } from "@/components/categories/category-tile";

// Mobile Components
import { MobileCategoriesView } from "@/components/mobile/categories/mobile-categories-view";

/**
 * /categories — every department and its categories.
 *
 * Drawn from the directory (lib/category-directory.ts), which the page reads
 * from the database. This component used to carry its own copy of the taxonomy
 * with its own icon set, and that copy is how two slugs the database did not
 * have survived here after leaving the nav (both tiles rendered a 404). Now
 * there is one list, and the tiles use the same pictures everywhere.
 *
 * Each department section carries `id={group.key}`, so "View all" on the home
 * page lands on it.
 */
export function CategoriesSwitcher({ directory }: { directory: DirectoryGroup[] }) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return directory
      .filter((g) => !activeFilter || g.key === activeFilter)
      .map((g) => ({
        ...g,
        categories: g.categories.filter(
          (c) => !q || c.name.toLowerCase().includes(q) || c.shortName.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.categories.length > 0);
  }, [directory, activeFilter, searchQuery]);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileCategoriesView directory={directory} />;
  }

  const pill = (on: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold transition-colors cursor-pointer ${
      on ? "bg-ink text-white" : "bg-paper text-ink shadow-card hover:bg-hush"
    }`;

  return (
    <>
      <Navbar />
      <main id="main-content">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-6 pt-11 sm:flex-row sm:items-end">
          <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl">All categories</h1>

          <label className="flex h-[52px] w-full max-w-[360px] items-center gap-3 rounded-full border border-line bg-paper px-5.5 shadow-card">
            <Search className="size-4.5 shrink-0 text-ink-500" aria-hidden />
            <span className="sr-only">Filter categories</span>
            <input
              type="search"
              placeholder="Filter categories"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-[13.5px] font-medium text-ink placeholder:text-ink-500 focus:outline-none"
            />
          </label>
        </div>

        <div role="group" aria-label="Departments" className="mx-auto flex max-w-[1200px] flex-wrap gap-2 px-6 pt-6.5">
          <button type="button" aria-pressed={activeFilter === null} onClick={() => setActiveFilter(null)} className={pill(activeFilter === null)}>
            All
          </button>
          {directory.map((group) => {
            const on = activeFilter === group.key;
            return (
              <button
                key={group.key}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveFilter(on ? null : group.key)}
                className={pill(on)}
              >
                {group.title}
              </button>
            );
          })}
        </div>

        <div className="space-y-12 pb-16 pt-10">
          {filteredGroups.length === 0 ? (
            <p className="mx-auto max-w-[1200px] px-6 text-sm text-ink-700">No category matches that filter.</p>
          ) : null}
          {filteredGroups.map((group) => (
            <section
              key={group.key}
              id={group.key}
              aria-labelledby={`all-${group.key}`}
              className="ve-reveal mx-auto max-w-[1200px] scroll-mt-24 px-6"
            >
              <h2 id={`all-${group.key}`} className="mb-5 text-[22px] font-bold tracking-[-0.02em] text-ink">
                {group.title}
              </h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {group.categories.map((entry) => (
                  <li key={entry.slug}>
                    <CategoryTile entry={entry} label="full" className="[&>span:last-child]:text-[13.5px] [&>span:last-child]:leading-[17px]" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
