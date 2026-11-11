/**
 * Launch Control: what customers see, category by category — the pure part.
 *
 * A category's customer-facing state is decided by the category directory
 * (lib/category-directory.ts), never restated here: the rows are passed
 * through `buildCategoryDirectory` exactly as the storefront does, and its
 * answer is read back. So this screen cannot disagree with the shop.
 *
 *   shown        — on the shop with at least one visible product
 *   coming_soon  — a designated category, switched on, nothing visible yet
 *   not_listed   — switched on, but outside the designated departments and
 *                  with nothing visible, so the directory leaves it out
 *   hidden       — switched off; nothing in it is shown, statuses untouched
 *   missing      — designated in code, but no such row in the database
 */
import {
  buildCategoryDirectory,
  PRIMARY_GROUPS,
  SECONDARY_GROUP,
  type DirectoryRow,
} from "@/lib/category-directory";

export type CategoryLaunchState = "shown" | "coming_soon" | "not_listed" | "hidden" | "missing";

export interface LaunchCategoryRow {
  slug: string;
  name: string;
  group: string;
  isActive: boolean;
  /** Products the storefront lists (catalogListingWhere). */
  visible: number;
  /** Every product in the category, by status. */
  byStatus: Partial<Record<"draft" | "catalog_only" | "published" | "archived", number>>;
  hasTaxMapping: boolean;
  /** The checkout mapping in lib/services/tax.ts, shown as it is. Its correctness is the CA's to confirm (ISS-086). */
  tax?: { hsn: string; ratePct: number } | null;
}

export interface LaunchCategory extends LaunchCategoryRow {
  state: CategoryLaunchState;
  total: number;
}

export interface LaunchDepartment {
  key: string;
  title: string;
  /** Curated departments are the shop's structure; the last group is everything else. */
  curated: boolean;
  categories: LaunchCategory[];
  /** Categories customers can reach in this department (shown or coming soon). */
  reachable: number;
}

const total = (r: LaunchCategoryRow) => Object.values(r.byStatus).reduce((a, b) => a + (b ?? 0), 0);

export function buildLaunchTree(rows: readonly LaunchCategoryRow[]): LaunchDepartment[] {
  const directory = buildCategoryDirectory(
    rows.map((r): DirectoryRow => ({ slug: r.slug, name: r.name, group: r.group, isActive: r.isActive, _count: { products: r.visible } })),
  );
  const listed = new Map(directory.flatMap((g) => g.categories.map((c) => [c.slug, c.state] as const)));
  const stateOf = (r: LaunchCategoryRow): CategoryLaunchState =>
    !r.isActive ? "hidden" : listed.get(r.slug) === "available" ? "shown" : listed.get(r.slug) === "coming_soon" ? "coming_soon" : "not_listed";

  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const curatedSlugs = new Set(PRIMARY_GROUPS.flatMap((g) => g.categories.map((c) => c.slug)));
  const reachable = (cs: LaunchCategory[]) => cs.filter((c) => c.state === "shown" || c.state === "coming_soon").length;

  const departments: LaunchDepartment[] = PRIMARY_GROUPS.map((g) => {
    const categories = g.categories.map((c): LaunchCategory => {
      const row = bySlug.get(c.slug);
      if (!row) {
        return { slug: c.slug, name: c.name, group: g.key, isActive: false, visible: 0, byStatus: {}, hasTaxMapping: false, state: "missing", total: 0 };
      }
      return { ...row, name: c.name, state: stateOf(row), total: total(row) };
    });
    return { key: g.key, title: g.title, curated: true, categories, reachable: reachable(categories) };
  });

  const others = rows
    .filter((r) => !curatedSlugs.has(r.slug))
    .map((r): LaunchCategory => ({ ...r, state: stateOf(r), total: total(r) }));
  if (others.length) {
    departments.push({ key: SECONDARY_GROUP.key, title: `${SECONDARY_GROUP.title} and other categories`, curated: false, categories: others, reachable: reachable(others) });
  }
  return departments;
}

export const CATEGORY_STATE_LABEL: Record<CategoryLaunchState, string> = {
  shown: "Shown",
  coming_soon: "Coming soon",
  not_listed: "Not listed",
  hidden: "Hidden",
  missing: "Not in database",
};

/** What each state means to an operator, in one line. */
export const CATEGORY_STATE_NOTE: Record<CategoryLaunchState, string> = {
  shown: "Customers can browse it.",
  coming_soon: "Customers see a tile marked Coming soon; nothing in it can be bought.",
  not_listed: "Switched on, but not in a department and nothing is visible, so customers cannot find it.",
  hidden: "Switched off. Its products keep their status and come back when it is switched on.",
  missing: "Part of the shop's design, but the database has no such category.",
};

/** The most products the category view explains at once; the rest are counted, not listed. */
export const LAUNCH_CATEGORY_LIMIT = 200;

/** The order the category view fills its LAUNCH_CATEGORY_LIMIT in: what customers can meet first. */
export const LAUNCH_STATUS_ORDER = [["published", "catalog_only"], ["draft"], ["archived"]] as const;
