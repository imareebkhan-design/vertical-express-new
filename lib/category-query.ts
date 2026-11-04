import type { CatalogQuery, CatalogSort } from "@/lib/services/catalog";
import { attributeConfigFor } from "@/lib/catalog-attributes";

/** One URL contract for the initial server page and subsequent phone pages. */
export function categoryQueryFromParams(slug: string, params: URLSearchParams): CatalogQuery {
  const attrs: Record<string, string> = {};
  for (const label of attributeConfigFor(slug).attributes) {
    const value = params.get(label.toLowerCase());
    if (value) attrs[label] = value;
  }
  const price = (key: string) => {
    const raw = params.get(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? Math.round(n * 100) : undefined;
  };
  const requestedSort = params.get("sort");
  const sort = ["newest", "most_ordered", "price_asc", "price_desc", "discount"].includes(requestedSort ?? "")
    ? requestedSort as CatalogSort : "newest";
  const requestedPage = Number(params.get("page"));
  return {
    categorySlug: slug,
    brandSlugs: params.getAll("brand").flatMap((b) => b.split(",")).filter(Boolean),
    attrs, minPaise: price("minPrice"), maxPaise: price("maxPrice"), sort,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}
