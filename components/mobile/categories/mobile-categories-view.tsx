"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Category } from "@prisma/client";
import {
  CATEGORY_GROUPS,
  TOTAL_CATEGORIES,
  CategoryGlyph,
  glyphFor,
} from "@/components/ui/product-panel";

/**
 * The app's categories screen, built to the `Categories` artboard.
 *
 * This is the only complete taxonomy in the app — Home is intent (reorders,
 * saved lists, running low) and deliberately shows a shortcut instead. The two
 * do not duplicate each other.
 *
 * The group filter is a client-side narrowing of a fixed list, not a query: all
 * 21 categories are known at build time, so tapping a group should not cost a
 * round trip on a 4G connection that comes and goes.
 */
export function MobileCategoriesView({
  categories,
}: {
  /* Accepted so the route's data contract is unchanged, but the tree renders
     from CATEGORY_GROUPS: the design fixes the order, the grouping and the
     display names, none of which the Category rows carry. */
  categories?: Category[];
}) {
  void categories;
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const groups = activeGroup
    ? CATEGORY_GROUPS.filter((g) => g.title === activeGroup)
    : CATEGORY_GROUPS;

  return (
    <div className="flex flex-col bg-canvas">
      {/* Reserved safe area — the OS draws its status bar here. */}
      <div className="h-[59px] flex-none" />

      <div className="flex items-start justify-between px-4 pt-2">
        <div>
          <h1 className="text-[23px] font-extrabold leading-7 tracking-[-0.022em] text-ink">
            Categories
          </h1>
          <p className="mt-1 text-[11px] font-semibold leading-[14px] text-ink-500">
            {TOTAL_CATEGORIES} categories · everything we stock in Srinagar
          </p>
        </div>
        <Link
          href="/search"
          aria-label="Search"
          className="flex size-[38px] flex-none items-center justify-center rounded-full bg-paper text-ink no-underline shadow-card"
        >
          <Search className="size-[19px]" strokeWidth={1.7} aria-hidden />
        </Link>
      </div>

      {/* Group filter — the active pill fills ink. */}
      <div className="flex gap-[7px] overflow-x-auto px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_GROUPS.map((g) => {
          const on = activeGroup === g.title;
          return (
            <button
              key={g.title}
              type="button"
              onClick={() => setActiveGroup(on ? null : g.title)}
              aria-pressed={on}
              className={`inline-flex h-7 flex-none items-center rounded-full px-[11px] text-[11.5px] font-bold tracking-[-0.01em] ${
                on ? "bg-ink text-white" : "bg-chip text-ink"
              }`}
            >
              {/* The pills carry the short group name; the section heading below
                  gives the full one. */}
              {g.title.replace(" & Architectural Hardware", " & Hardware").replace(", Sanitary & Bath", "")}
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <section key={group.title} className="px-4 pt-5">
          <div className="flex items-center gap-[9px]">
            <span
              className="size-[11px] flex-none rounded-[4px]"
              style={{ backgroundColor: group.tint }}
            />
            <h2 className="text-[17px] font-bold leading-[21px] tracking-[-0.018em] text-ink">
              {group.title}
            </h2>
            <span className="text-[11px] font-semibold leading-[14px] text-ink-500">
              {group.categories.length}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {group.categories.map((c) => (
              <Link key={c.slug} href={`/category/${c.slug}`} className="no-underline">
                <div
                  className="flex h-[74px] w-full items-center justify-center overflow-hidden rounded-[18px]"
                  style={{ backgroundColor: group.tint }}
                >
                  <CategoryGlyph name={glyphFor(c.slug)} className="size-8" />
                </div>
                <div className="mt-1.5 h-[26px] overflow-hidden text-center text-[11px] font-semibold leading-[13px] text-ink">
                  {c.name}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <div className="h-5 flex-none" />
    </div>
  );
}
