import Link from "next/link";
import { adminListProducts } from "@/lib/services/admin/manage";
import { db } from "@/lib/db";
import { ProductBrandSelect } from "@/components/admin/product-brand-select";
import { formatPaise } from "@/lib/money";
import { ProductStatusChip, StatusChip } from "@/components/admin/status-chip";
import { getAdminUser } from "@/lib/services/admin/authz";
import {
  parseProductsQuery,
  productsHref,
  PRODUCT_STATUS_FILTERS,
  PRODUCTS_PER_PAGE,
  MAX_SEARCH_LENGTH,
} from "@/lib/admin-products-query";

export const dynamic = "force-dynamic";

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const query = parseProductsQuery(await searchParams);
  const [{ products, total, statusCounts, unfilteredTotal }, brands, allBrands, categories] = await Promise.all([
    adminListProducts(query.page, PRODUCTS_PER_PAGE, query),
    /* Only active brands are offered — an inactive one is retired, and
       assigning a product to it would hide the product from the storefront by
       a side door. */
    db.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    /* Filtering is by any brand, retired ones included — a product can still
       carry one, and an operator looking for it must be able to find it. */
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));
  const from = total === 0 ? 0 : (query.page - 1) * PRODUCTS_PER_PAGE + 1;
  const to = Math.min(total, query.page * PRODUCTS_PER_PAGE);
  const filtered = Boolean(query.q || query.status || query.categoryId || query.brandId);
  const field =
    "h-9 rounded-field bg-chip-soft px-3 text-[12.5px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Products</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {filtered ? `${total} of ${unfilteredTotal} products match` : `${unfilteredTotal} products`}
        </p>
      </div>

      {/* A plain GET form: works without JavaScript, and the result is a URL
          that can be bookmarked or sent to someone. */}
      <form action="/admin/products" method="get" className="flex flex-wrap items-center gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          maxLength={MAX_SEARCH_LENGTH}
          placeholder="Search title, SKU or brand"
          aria-label="Search products by title, SKU or brand"
          className={`${field} w-full sm:w-72`}
        />
        <select name="category" defaultValue={query.categoryId ?? ""} aria-label="Category" className={`${field} max-w-[12rem]`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="brand" defaultValue={query.brandId ?? ""} aria-label="Brand" className={`${field} max-w-[12rem]`}>
          <option value="">All brands</option>
          {allBrands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {query.status && <input type="hidden" name="status" value={query.status} />}
        <button type="submit" className="h-9 rounded-panel bg-ink px-4 text-[12.5px] font-bold text-white">
          Search
        </button>
        {filtered && (
          <Link href="/admin/products" className="text-[12px] font-bold text-ink-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <nav aria-label="Product status" className="flex flex-wrap gap-1.5">
        {[{ key: null, label: "All" }, ...PRODUCT_STATUS_FILTERS].map((s) => {
          const active = query.status === s.key;
          const count = s.key ? statusCounts[s.key] : Object.values(statusCounts).reduce((a, b) => a + b, 0);
          return (
            <Link
              key={s.key ?? "all"}
              href={productsHref(query, { status: s.key })}
              aria-current={active ? "page" : undefined}
              className={`rounded-chip px-3 py-1.5 text-[12px] tabular-nums transition-colors ${
                active ? "bg-ink font-bold text-white" : "bg-chip font-semibold hover:bg-hush"
              }`}
            >
              {s.label} {count}
            </Link>
          );
        })}
      </nav>

      <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Product</th>
              <th className="px-3 pb-2.5">Brand</th>
              <th className="px-3 pb-2.5">Category</th>
              <th className="px-3 pb-2.5 text-right">Price</th>
              <th className="px-3 pb-2.5 text-right">Stock</th>
              <th className="px-3 pb-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const variant = p.variants[0];
              const stock =
                variant?.inventory.reduce((s, i) => s + (i.qtyOnHand - i.qtyReserved), 0) ?? 0;
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-3">
                    {/* The row opens the editor, not the storefront page — this
                        is the console, and "View on site" lives inside it. */}
                    <Link
                      href={`/admin/products/${p.slug}`}
                      className="text-[12.5px] font-bold hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="text-[11px] font-semibold tabular-nums text-ink-500">
                      {variant?.sku ?? "no default variant"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <ProductBrandSelect
                      productId={p.id}
                      currentBrandId={p.brand.id}
                      brands={brands}
                    />
                  </td>
                  <td className="px-3 py-3 text-[12px] font-semibold text-ink-500">
                    {p.category.name}
                  </td>
                  <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                    {variant ? formatPaise(variant.pricePaise) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {stock <= 0 ? (
                      <StatusChip tone="bad">Out</StatusChip>
                    ) : stock <= 10 ? (
                      <StatusChip tone="warn">{stock} left</StatusChip>
                    ) : (
                      <span className="text-[12.5px] font-semibold tabular-nums">{stock}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <ProductStatusChip status={p.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 && (
          <p className="px-3 py-8 text-center text-[12.5px] font-semibold text-ink-500">
            {filtered ? "No product matches. Try fewer words, or clear the filters." : "No products yet."}
          </p>
        )}
      </div>

      {total > 0 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-semibold tabular-nums text-ink-500">
            Showing {from}–{to} of {total}
          </p>
          <div className="flex items-center gap-2">
            {query.page > 1 ? (
              <Link href={productsHref(query, { page: query.page - 1 })} className="rounded-chip bg-chip px-3.5 py-1.5 text-[12px] font-bold hover:bg-hush">
                Previous
              </Link>
            ) : null}
            <span className="text-[12px] font-semibold tabular-nums text-ink-500">
              Page {Math.min(query.page, pages)} of {pages}
            </span>
            {query.page < pages ? (
              <Link href={productsHref(query, { page: query.page + 1 })} className="rounded-chip bg-chip px-3.5 py-1.5 text-[12px] font-bold hover:bg-hush">
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      )}

      <p className="rounded-panel bg-ops-warn-tint p-4 text-[12px] font-semibold leading-relaxed text-ops-warn">
        Read-only (ISS-019). Creating and editing products from here needs HSN and GST rate
        per product, which the schema does not carry yet — and an invoice cannot be raised
        without them. Editing arrives with those columns.
      </p>
    </div>
  );
}
