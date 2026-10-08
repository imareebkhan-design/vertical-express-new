/**
 * Categories the curated index does not list by name.
 *
 * The category index (desktop `categories-switcher.tsx`, phone
 * `mobile-categories-view.tsx`) draws a fixed, designed taxonomy. Categories
 * that become active later — the catalogue import's Power Tools, Outdoor &
 * Agriculture Equipment, Spare Parts & Accessories, and later CCTV or Steel —
 * are not in it, so their products were reachable only by search.
 *
 * Rather than hardcoding more slugs (which 404 wherever the category does not
 * exist, e.g. production before the import), the index appends any active
 * category that holds visible products and is not already listed, under the
 * display group for its database `group`. "tools" joins General Hardware &
 * Tools under Furniture & Architectural Hardware.
 */
export const GROUP_TITLE_FOR: Record<string, string> = {
  civil_interiors: "Civil & Interiors",
  furniture_hardware: "Furniture & Architectural Hardware",
  tools: "Furniture & Architectural Hardware",
  other: "Furniture & Architectural Hardware",
  electrical: "Electrical",
  plumbing_bath: "Plumbing, Sanitary & Bath",
};

export interface IndexableCategory {
  slug: string;
  name: string;
  group: string;
  isActive: boolean;
  _count: { products: number };
}

/** Group title → categories to append, in the order given (sortOrder from the query). */
export function unlistedCategories(
  categories: readonly IndexableCategory[],
  listedSlugs: ReadonlySet<string>
): Map<string, { name: string; slug: string }[]> {
  const out = new Map<string, { name: string; slug: string }[]>();
  for (const c of categories) {
    if (!c.isActive || c._count.products <= 0 || listedSlugs.has(c.slug)) continue;
    const title = GROUP_TITLE_FOR[c.group] ?? GROUP_TITLE_FOR.other;
    out.set(title, [...(out.get(title) ?? []), { name: c.name, slug: c.slug }]);
  }
  return out;
}
