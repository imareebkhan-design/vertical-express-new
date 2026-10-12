/**
 * The category directory: which departments the shop is arranged in, in what
 * order, under which names — and, per category, whether there is anything on
 * the shelf yet.
 *
 * ONE SOURCE. The grouping used to be written out three times (the home tiles,
 * the desktop index with its own icon set, the phone index) and the three had
 * already drifted. Every surface — web home, /categories on desktop and phone,
 * `/api/v1/categories` for the app — now reads it from here.
 *
 * DISCOVERY IS NOT PUBLICATION (owner, 12 Oct 2026). The original material
 * departments are the shop's structure, so an active category in them is shown
 * even before any of its products is approved — labelled "Coming soon", with
 * no count, price, stock or basket action. Which PRODUCTS appear is unchanged:
 * still `catalogListingWhere()` and the approval and licensing gates. A
 * category the database does not have, or has switched off, is never shown
 * (it would lead to a 404).
 *
 * Categories outside the curated departments (the catalogue import's Power
 * Tools, Outdoor & Agriculture, Spare Parts, and anything added later) appear
 * in a secondary group, placed last, and only once they hold a visible
 * product: nobody designated them as part of the shop's structure, so an empty
 * one is not announced.
 *
 * Display names here are labels, not data: the database keeps its own names
 * and slugs (e.g. Adhesives & Sealants is slug `fevicol`).
 *
 * Pure and dependency-free so the server, the client components and the tests
 * all read the same rules.
 */

export type DiscoveryState = "available" | "coming_soon";

export interface CuratedCategory {
  slug: string;
  /** Full display name: section headings, category page, accessible labels. */
  name: string;
  /** Tile label, read at a glance. */
  shortName: string;
}

export interface CuratedGroup {
  /** The database `Category.group` this department mirrors. */
  key: string;
  title: string;
  /** Filter pill label. */
  shortTitle: string;
  /** CSS colour token behind the department's tiles. */
  tint: string;
  categories: CuratedCategory[];
}

/** The four material departments, in the order a building goes up. */
export const PRIMARY_GROUPS: readonly CuratedGroup[] = [
  {
    key: "civil_interiors",
    title: "Civil & Interiors",
    shortTitle: "Civil & Interiors",
    tint: "var(--color-tint-civil)",
    categories: [
      { slug: "cement", name: "Cement", shortName: "Cement" },
      { slug: "tiling", name: "Tiling", shortName: "Tiling" },
      { slug: "painting", name: "Painting", shortName: "Painting" },
      { slug: "waterproofing", name: "Waterproofing", shortName: "Waterproofing" },
      { slug: "plywood-mdf-hdhmr", name: "Plywood, MDF & HDHMR", shortName: "Plywood & MDF" },
      { slug: "fevicol", name: "Adhesives & Sealants", shortName: "Adhesives" },
    ],
  },
  {
    key: "furniture_hardware",
    title: "Furniture & Architectural Hardware",
    shortTitle: "Furniture & Hardware",
    tint: "var(--color-tint-furniture)",
    categories: [
      { slug: "hinges-channels-handles", name: "Hinges, Channels & Handles", shortName: "Hinges & handles" },
      { slug: "kitchen-systems-accessories", name: "Kitchen Systems", shortName: "Kitchen systems" },
      { slug: "wardrobe-bed-fittings", name: "Wardrobe & Bed Fittings", shortName: "Wardrobe fittings" },
      { slug: "door-locks-hardware", name: "Door Locks & Hardware", shortName: "Door locks" },
      { slug: "general-hardware-tools", name: "General Hardware & Tools", shortName: "Hardware & tools" },
    ],
  },
  {
    key: "electrical",
    title: "Electrical",
    shortTitle: "Electrical",
    tint: "var(--color-tint-electrical)",
    categories: [
      { slug: "wires-mcb-distribution-boards", name: "Wires, MCB & Distribution", shortName: "Wires & MCB" },
      { slug: "switches-sockets", name: "Switches & Sockets", shortName: "Switches" },
      { slug: "conduits-gi-boxes", name: "Conduits & GI Boxes", shortName: "Conduits" },
      { slug: "lighting", name: "Lighting", shortName: "Lighting" },
      { slug: "ceiling-fans-exhaust", name: "Ceiling Fans & Exhaust", shortName: "Fans" },
      { slug: "home-appliances-power-backup", name: "Home Appliances & Power Backup", shortName: "Power backup" },
    ],
  },
  {
    key: "plumbing_bath",
    title: "Plumbing, Sanitary & Bath",
    shortTitle: "Plumbing & Bath",
    tint: "var(--color-tint-plumbing)",
    categories: [
      { slug: "cpvc-pipes-overhead-tanks", name: "CPVC Pipes & Overhead Tanks", shortName: "Pipes & tanks" },
      { slug: "sanitary-bath-fittings", name: "Sanitary & Bath Fittings", shortName: "Bath fittings" },
      { slug: "kitchen-sinks-faucets", name: "Kitchen Sinks & Faucets", shortName: "Kitchen sinks" },
    ],
  },
];

/** Where categories outside the four departments go: last, and only when stocked. */
export const SECONDARY_GROUP = {
  key: "tools_equipment",
  title: "Tools & Equipment",
  shortTitle: "Tools & Equipment",
  tint: "var(--color-tint-furniture)",
} as const;

const CURATED = new Map(PRIMARY_GROUPS.flatMap((g) => g.categories.map((c) => [c.slug, c] as const)));

/** Whether a slug is one of the shop's designated material categories. */
export function isCuratedCategory(slug: string): boolean {
  return CURATED.has(slug);
}

/** The curated entry for a slug, if it is one. */
export function curatedCategory(slug: string): CuratedCategory | null {
  return CURATED.get(slug) ?? null;
}

/** A database row as the directory needs it: `_count.products` is the VISIBLE count. */
export interface DirectoryRow {
  slug: string;
  name: string;
  group: string;
  isActive: boolean;
  _count: { products: number };
}

export interface DirectoryEntry {
  slug: string;
  name: string;
  shortName: string;
  state: DiscoveryState;
  /** Visible products. Never rendered on a tile; it decides `state`. */
  visibleProducts: number;
}

export interface DirectoryGroup {
  key: string;
  title: string;
  shortTitle: string;
  tint: string;
  primary: boolean;
  categories: DirectoryEntry[];
}

/**
 * The directory for a set of database rows. Curated groups keep the curated
 * order; the secondary group keeps the rows' order (the query's sortOrder).
 * Groups with nothing to show are dropped.
 */
export function buildCategoryDirectory(rows: readonly DirectoryRow[]): DirectoryGroup[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const entry = (row: DirectoryRow, c?: CuratedCategory): DirectoryEntry => {
    const visibleProducts = Math.max(0, row._count.products);
    return {
      slug: row.slug,
      name: c?.name ?? row.name,
      shortName: c?.shortName ?? row.name,
      state: visibleProducts > 0 ? "available" : "coming_soon",
      visibleProducts,
    };
  };

  const groups: DirectoryGroup[] = PRIMARY_GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    shortTitle: g.shortTitle,
    tint: g.tint,
    primary: true,
    categories: g.categories.flatMap((c) => {
      const row = bySlug.get(c.slug);
      return row && row.isActive ? [entry(row, c)] : [];
    }),
  }));

  const secondary = rows.filter((r) => r.isActive && !CURATED.has(r.slug) && r._count.products > 0);
  groups.push({ ...SECONDARY_GROUP, primary: false, categories: secondary.map((r) => entry(r)) });

  return groups.filter((g) => g.categories.length > 0);
}

/** Whether a category page should exist for this row (see the module comment). */
export function isDiscoverable(row: Pick<DirectoryRow, "slug" | "isActive" | "_count">): boolean {
  if (!row.isActive) return false;
  return row._count.products > 0 || CURATED.has(row.slug);
}

/** Every entry, flattened in display order. */
export function directoryEntries(groups: readonly DirectoryGroup[]): DirectoryEntry[] {
  return groups.flatMap((g) => g.categories);
}
