/**
 * The admin product list's URL state: search text, filters and page.
 *
 * Pure and client-safe, like `lib/admin-orders-query.ts`. The list used to take
 * no query at all and render the 30 most recently updated products with no way
 * to page, so every other product in a catalogue of hundreds was unreachable
 * from the console. Everything a person can filter by lives in the URL, so a
 * filtered list can be bookmarked and shared.
 *
 * Anything malformed is dropped rather than passed on: a category or brand id
 * that is not a UUID would make Prisma throw on a `@db.Uuid` column and turn a
 * mistyped link into a 500.
 */

export const PRODUCT_STATUS_FILTERS = [
  { key: "draft", label: "Draft" },
  { key: "catalog_only", label: "Catalogue only" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
] as const;
export type ProductStatusKey = (typeof PRODUCT_STATUS_FILTERS)[number]["key"];

export const PRODUCTS_PER_PAGE = 30;
/**
 * The highest page a URL may ask for. 10,000 pages of 30 is 300,000 products,
 * far past any catalogue this shop will hold; anything larger is a typo or a
 * probe, and passing it on would become an enormous OFFSET.
 */
export const MAX_PAGE = 10_000;
export const MAX_SEARCH_LENGTH = 100;

export interface ProductsQuery {
  /** Matches title, slug, SKU or brand name, case-insensitively. Empty: no search. */
  q: string;
  status: ProductStatusKey | null;
  categoryId: string | null;
  brandId: string | null;
  /** 1-based. */
  page: number;
}

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function parseProductsQuery(sp: Params): ProductsQuery {
  const status = one(sp.status);
  const categoryId = one(sp.category);
  const brandId = one(sp.brand);
  /* Digits only. `parseInt` read "3abc" as 3 and "1e3" as 1, and a 25-digit
     number as something Postgres cannot use as an offset. */
  const rawPage = one(sp.page);
  const page = /^[1-9][0-9]{0,4}$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    q: one(sp.q).slice(0, MAX_SEARCH_LENGTH),
    status: PRODUCT_STATUS_FILTERS.some((s) => s.key === status) ? (status as ProductStatusKey) : null,
    categoryId: UUID.test(categoryId) ? categoryId.toLowerCase() : null,
    brandId: UUID.test(brandId) ? brandId.toLowerCase() : null,
    page: page <= MAX_PAGE ? page : 1,
  };
}

/** The list URL for `query`, with `change` applied. Changing a filter resets the page. */
export function productsHref(query: ProductsQuery, change: Partial<ProductsQuery> = {}): string {
  const filterChanged = Object.keys(change).some((k) => k !== "page");
  const next = { ...query, ...change, ...(filterChanged && change.page === undefined ? { page: 1 } : {}) };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.status) p.set("status", next.status);
  if (next.categoryId) p.set("category", next.categoryId);
  if (next.brandId) p.set("brand", next.brandId);
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `/admin/products?${s}` : "/admin/products";
}
