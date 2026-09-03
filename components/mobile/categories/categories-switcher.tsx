"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { CategoryWithCount } from "@/lib/services/catalog";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { PageLoader } from "@/components/page-loader";

// Mobile Components
import { MobileCategoriesView } from "@/components/mobile/categories/mobile-categories-view";
import { TOTAL_CATEGORIES } from "@/components/ui/product-panel";

interface CategoriesSwitcherProps {
  /** Carries `_count.products`, which the tiles render. */
  categories: CategoryWithCount[];
}

interface GroupDefinition {
  title: string;
  theme: "civil" | "furn" | "elec" | "plumb";
  themeColor: string;
  categories: {
    name: string;
    slug: string;
    iconSvg: React.ReactNode;
  }[];
}

const GROUPS: GroupDefinition[] = [
  {
    title: "Civil & Interiors",
    theme: "civil",
    themeColor: "var(--t-civil)",
    categories: [
      {
        name: "Cement",
        slug: "cement",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M6 3h12l2 6v12H4V9z" />
            <path d="M10 3v6h4V3" />
          </svg>
        ),
      },
      {
        name: "Tiling",
        slug: "tiling",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="3" y="3" width="8" height="8" rx="1" />
            <rect x="13" y="3" width="8" height="8" rx="1" />
            <rect x="3" y="13" width="8" height="8" rx="1" />
            <rect x="13" y="13" width="8" height="8" rx="1" />
          </svg>
        ),
      },
      {
        name: "Painting",
        slug: "painting",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7" />
            <path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
          </svg>
        ),
      },
      {
        name: "Waterproofing",
        slug: "waterproofing",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          </svg>
        ),
      },
      {
        name: "Plywood, MDF & HDHMR",
        slug: "plywood-mdf-hdhmr",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M3 7l9-4 9 4-9 4-9-4z" />
            <path d="M3 12l9 4 9-4" />
            <path d="M3 17l9 4 9-4" />
          </svg>
        ),
      },
      {
        name: "Adhesives & Sealants",
        slug: "fevicol",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M10 2v4h4V2" />
            <path d="M6 6h12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Furniture & Architectural Hardware",
    theme: "furn",
    themeColor: "var(--t-furn)",
    categories: [
      {
        name: "Hinges, Channels & Handles",
        slug: "hinges-channels-handles",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="16" r="1.5" />
          </svg>
        ),
      },
      {
        name: "Kitchen Systems",
        slug: "kitchen-systems-accessories",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M3 6h18v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M3 10h18" />
          </svg>
        ),
      },
      {
        name: "Wardrobe & Bed Fittings",
        slug: "wardrobe-bed-fittings",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M12 3v18" />
          </svg>
        ),
      },
      {
        name: "Door Locks & Hardware",
        slug: "door-locks-hardware",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        ),
      },
      {
        name: "General Hardware & Tools",
        slug: "general-hardware-tools",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Electrical",
    theme: "elec",
    themeColor: "var(--t-elec)",
    categories: [
      {
        name: "Wires, MCB & Distribution",
        slug: "wires-mcb-distribution-boards",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M9 9h6v6H9z" />
          </svg>
        ),
      },
      {
        name: "Switches & Sockets",
        slug: "switches-sockets",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="5" y="3" width="14" height="18" rx="3" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ),
      },
      {
        name: "Conduits & GI Boxes",
        slug: "conduits-gi-boxes",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <circle cx="8" cy="12" r="2" />
            <circle cx="16" cy="12" r="2" />
          </svg>
        ),
      },
      {
        name: "Lighting",
        slug: "lighting",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 5.5v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V14.5c1.5-1 3-3 3-5.5a7 7 0 0 0-7-7z" />
          </svg>
        ),
      },
      {
        name: "Ceiling Fans & Exhaust",
        slug: "ceiling-fans-exhaust",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 9c0-3.5 2-5 5-5s2 3.5 0 5-5 0-5 0z" />
            <path d="M9 12c-3.5 0-5-2-5-5s3.5-2 5 0 0 5 0 5z" />
            <path d="M12 15c0 3.5-2 5-5 5s-2-3.5 0-5 5 0 5 0z" />
            <path d="M15 12c3.5 0 5 2 5 5s-3.5 2-5 0 0-5 0-5z" />
          </svg>
        ),
      },
      {
        /* The category this page was missing. "appliances-power-backup" sat
           here and 404'd — a slug typo for this one, which exists and holds two
           published products. 9386b36 corrected the typo in the navigation and
           did not look at the category index, so the real category stayed
           unreachable from the page whose entire job is to list them. */
        name: "Home Appliances & Power Backup",
        slug: "home-appliances-power-backup",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M9 12h6" />
            <path d="M12 9v6" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Plumbing, Sanitary & Bath",
    theme: "plumb",
    themeColor: "var(--t-plumb)",
    categories: [
      {
        name: "CPVC Pipes & Overhead Tanks",
        slug: "cpvc-pipes-overhead-tanks",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M4 6h16v12H4z" />
            <path d="M8 6v12" />
            <path d="M16 6v12" />
          </svg>
        ),
      },
      {
        name: "Sanitary & Bath Fittings",
        slug: "sanitary-bath-fittings",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <path d="M4 12h16a1 1 0 0 1 1 1v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2a1 1 0 0 1 1-1z" />
            <path d="M6 12V5a2 2 0 0 1 2-2h1" />
          </svg>
        ),
      },
      {
        name: "Kitchen Sinks & Faucets",
        slug: "kitchen-sinks-faucets",
        iconSvg: (
          <svg className="size-12 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="12" r="3" />
          </svg>
        ),
      },
    ],
  },
];

export function CategoriesSwitcher({ categories }: CategoriesSwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  /* The page has always fetched the real categories and this component has
     always discarded them — the prop was named `_categories` to say so — while
     rendering a hardcoded list beside a hardcoded count. That is how two slugs
     the database does not have (appliances-power-backup, power-tools-accessories)
     survived here after being removed from the nav in 9386b36: both rendered a
     404 page from a tile on the category index. */
  const countBySlug = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c._count.products])),
    [categories]
  );

  const filteredGroups = useMemo(() => {
    return GROUPS.map((group) => {
      if (activeFilter && group.title !== activeFilter) {
        return null;
      }
      const matchedCategories = group.categories.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchedCategories.length === 0) return null;
      return {
        ...group,
        categories: matchedCategories,
      };
    }).filter(Boolean) as GroupDefinition[];
  }, [activeFilter, searchQuery]);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileCategoriesView categories={categories} />;
  }

  return (
    <>
      <Navbar />
      <main id="main-content">
        {/* Page Header */}
        <div className="mx-auto flex max-w-[1200px] flex-col sm:flex-row items-start sm:items-end justify-between gap-6 px-6 pt-11">
          <div>
            <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl lg:text-[46px] lg:leading-[52px]">
              <span className="font-light text-ink/70">Everything we hold</span>
              <br />
              in Srinagar.
            </h1>
            <p className="mt-3 text-[14.5px] font-medium text-ink-700">
              {TOTAL_CATEGORIES} categories in four groups. This is the complete list — the home page only shows a shortcut.
            </p>
          </div>

          {/* Filter Search Input */}
          <div className="flex h-[52px] w-full max-w-[360px] items-center gap-3 rounded-full bg-paper px-5.5 shadow-card border border-line">
            <Search className="size-4.5 text-ink-500 shrink-0" aria-hidden />
            <input
              type="search"
              placeholder="Filter categories"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-[13.5px] font-medium text-ink placeholder:text-ink-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Group Filter Pills */}
        <div className="mx-auto flex max-w-[1200px] flex-wrap gap-2 px-6 pt-6.5">
          <button
            onClick={() => setActiveFilter(null)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold transition-colors cursor-pointer ${
              activeFilter === null
                ? "bg-ink text-white"
                : "bg-paper text-ink shadow-card hover:bg-hush"
            }`}
          >
            <span>All Groups</span>
            <span className={activeFilter === null ? "text-white/60" : "text-ink-500"}>
              21
            </span>
          </button>

          {GROUPS.map((group) => {
            const isSelected = activeFilter === group.title;
            return (
              <button
                key={group.title}
                onClick={() => setActiveFilter(isSelected ? null : group.title)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-ink text-white"
                    : "bg-paper text-ink shadow-card hover:bg-hush"
                }`}
              >
                <span>{group.title}</span>
                <span className={isSelected ? "text-white/60" : "text-ink-500"}>
                  {group.categories.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Group Sections */}
        <div className="space-y-16 pt-10 pb-16">
          {filteredGroups.map((group) => (
            <section key={group.title} className="mx-auto max-w-[1200px] px-6">
              <div className="mb-5 flex items-center gap-3">
                <span
                  className="size-3.5 rounded-[5px]"
                  style={{ backgroundColor: group.themeColor }}
                />
                <h2 className="text-[26px] font-bold tracking-[-0.02em] text-ink">
                  {group.title}
                </h2>
                <span className="text-[13.5px] font-medium text-ink-500">
                  {group.categories.length} categories
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {group.categories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/category/${cat.slug}`}
                    className="group flex flex-col items-center no-underline"
                  >
                    <div
                      className="flex h-[118px] w-full items-center justify-center rounded-[20px] text-ink-700 transition-transform duration-200 group-hover:scale-105"
                      style={{ backgroundColor: group.themeColor }}
                    >
                      {cat.iconSvg}
                    </div>
                    <span className="mt-2.5 text-center text-[13.5px] font-bold leading-[17px] text-ink group-hover:text-brand-deep transition-colors">
                      {cat.name}
                    </span>
                    <span className="mt-0.5 text-center text-[11px] font-medium text-ink-500">
                      {/* Was a literal per tile — "203 products" under Lighting,
                          "134 products" under Sanitary & bath, 1,565 across the
                          twenty-one of them against a catalogue of 45. Same
                          defect as the home-page tiles and the hero's "4,100
                          products" before them. */}
                      {countBySlug[cat.slug] === undefined
                        ? "\u00a0"
                        : countBySlug[cat.slug] === 0
                          ? "Nothing in stock"
                          : `${countBySlug[cat.slug]} product${countBySlug[cat.slug] === 1 ? "" : "s"}`}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Bottom Strips */}
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

