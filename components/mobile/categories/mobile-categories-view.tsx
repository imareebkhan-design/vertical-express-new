"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { CategoryTile } from "@/components/categories/category-tile";
import type { DirectoryGroup } from "@/lib/category-directory";

/**
 * The phone's categories screen, built to the `Categories` artboard.
 *
 * Renders the directory (lib/category-directory.ts): the four material
 * departments in their fixed order, designated categories with nothing
 * approved yet labelled "Coming soon", then Tools & Equipment. Inactive or
 * missing categories never appear (they would 404).
 *
 * The department filter is a client-side narrowing of a list the page already
 * has, so tapping one costs no round trip on a 4G connection that comes and goes.
 */
export function MobileCategoriesView({ directory = [] }: { directory?: readonly DirectoryGroup[] }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const groups = activeGroup ? directory.filter((g) => g.key === activeGroup) : directory;

  return (
    <div className="flex flex-col bg-canvas">
      {/* Reserved safe area — the OS draws its status bar here. */}
      <div className="h-[59px] flex-none" />

      <div className="flex items-start justify-between px-4 pt-2">
        <h1 className="text-[23px] font-extrabold leading-7 tracking-[-0.022em] text-ink">Categories</h1>
        <Link
          href="/search"
          aria-label="Search"
          className="flex size-[38px] flex-none items-center justify-center rounded-full bg-paper text-ink no-underline shadow-card"
        >
          <Search className="size-[19px]" strokeWidth={1.7} aria-hidden />
        </Link>
      </div>

      {/* Department filter — the active pill fills ink. */}
      <div
        role="group"
        aria-label="Departments"
        className="flex gap-[7px] overflow-x-auto px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {directory.map((g) => {
          const on = activeGroup === g.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setActiveGroup(on ? null : g.key)}
              aria-pressed={on}
              className={`inline-flex h-7 flex-none items-center rounded-full px-[11px] text-[11.5px] font-bold tracking-[-0.01em] ${
                on ? "bg-ink text-white" : "bg-chip text-ink"
              }`}
            >
              {g.shortTitle}
            </button>
          );
        })}
      </div>

      {directory.length === 0 && <p className="px-4 pt-5 text-sm text-ink-700">No categories are available yet.</p>}

      {groups.map((group) => (
        <section key={group.key} id={group.key} aria-labelledby={`m-${group.key}`} className="scroll-mt-4 px-4 pt-5">
          <h2 id={`m-${group.key}`} className="text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink">
            {group.title}
          </h2>
          <ul className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
            {group.categories.map((entry) => (
              <li key={entry.slug}>
                <CategoryTile entry={entry} className="[&>span:last-child]:text-[11px] [&>span:last-child]:leading-[13px]" />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="h-5 flex-none" />
    </div>
  );
}
