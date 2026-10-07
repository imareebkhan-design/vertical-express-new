"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CATEGORY_GROUPS, ProductPanel } from "@/components/ui/product-panel";

/**
 * Every category, as a picture and a name — the grid a shopper scans to find
 * their aisle. Two rows of ten on desktop.
 *
 * Short names, because a tile label is read at a glance; the category page
 * carries the full one. No product counts: a number under a tile is noise to a
 * shopper and, written by hand, it was wrong (879 claimed against 30 held).
 */
const SHORT_NAME: Record<string, string> = {
  "plywood-mdf-hdhmr": "Plywood & MDF",
  fevicol: "Adhesives",
  "hinges-channels-handles": "Hinges & handles",
  "kitchen-systems-accessories": "Kitchen systems",
  "wardrobe-bed-fittings": "Wardrobe fittings",
  "door-locks-hardware": "Door locks",
  "general-hardware-tools": "Hardware & tools",
  "wires-mcb-distribution-boards": "Wires & MCB",
  "switches-sockets": "Switches",
  "conduits-gi-boxes": "Conduits",
  "ceiling-fans-exhaust": "Fans",
  "home-appliances-power-backup": "Inverters",
  "cpvc-pipes-overhead-tanks": "Pipes & tanks",
  "sanitary-bath-fittings": "Bath fittings",
  "kitchen-sinks-faucets": "Kitchen sinks",
};

const ALL = CATEGORY_GROUPS.flatMap((g) => g.categories).map((c) => ({
  slug: c.slug,
  name: SHORT_NAME[c.slug] ?? c.name,
}));

/** Published products per category slug, from `listCategories()`. */
export type CategoryCounts = Record<string, number>;

export function Categories({ counts }: { counts: CategoryCounts }) {
  /* A category with nothing published is an empty shelf; it is left out rather
     than shown as a tile that leads nowhere. Inactive categories are not in
     `counts` at all. */
  const tiles = ALL.filter((c) => (counts[c.slug] ?? 0) > 0);

  return (
    <section id="categories" className="ve-reveal pt-14">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-ink sm:text-[28px]">Shop by category</h2>
          <Link
            href="/categories"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-ink no-underline hover:text-ink-700"
          >
            See all
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        <ul className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5 lg:grid-cols-10">
          {tiles.map((cat) => (
            <li key={cat.slug}>
              <Link href={`/category/${cat.slug}`} className="group flex flex-col items-center no-underline">
                <ProductPanel
                  categorySlug={cat.slug}
                  label={cat.name}
                  className="ve-cat-tile aspect-square w-full rounded-[18px]"
                  glyphClassName="size-1/2"
                />
                <span className="mt-2 text-center text-[12.5px] font-semibold leading-4 text-ink">{cat.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
