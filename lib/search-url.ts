/**
 * Search URLs for the category chips (W-17), shared by desktop and phone-web.
 *
 * `/search` reads `q`, `brand`, `minPrice`, `maxPrice`, `sort`, `page` and
 * `category` — the same `category` parameter the app's `/api/v1/products`
 * takes. A chip keeps the query and every other filter, sets or clears the
 * category, and drops `page`: page 3 of one shelf is not page 3 of another.
 */

const KEPT = ["q", "brand", "minPrice", "maxPrice", "sort"] as const;

export function searchCategoryHref(current: URLSearchParams, categorySlug: string | null): string {
  const next = new URLSearchParams();
  for (const key of KEPT) {
    for (const value of current.getAll(key)) next.append(key, value);
  }
  if (categorySlug) next.set("category", categorySlug);
  return `/search?${next.toString()}`;
}

export interface CategoryFacet {
  slug: string;
  name: string;
  count: number;
}

/**
 * Which chips to draw — the app's rule (mobile/src/screens/search): only when
 * the results span more than one shelf, or a shelf is already picked (so it can
 * be cleared). Each count is the server's, over every match with the current
 * filters, so it is exactly what the chip opens.
 */
export function categoryChips(categories: CategoryFacet[] | undefined, selected: string | null): CategoryFacet[] {
  const list = categories ?? [];
  /* A picked shelf with no matches is absent here; the chips component then
     offers only the way back out. */
  if (selected) return list.filter((c) => c.slug === selected);
  return list.length > 1 ? list : [];
}
