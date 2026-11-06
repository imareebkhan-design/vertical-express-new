import { test } from "node:test";
import assert from "node:assert/strict";
import { listProducts } from "../catalog";
import { searchCategoryHref } from "@/lib/search-url";

/**
 * W-17: a category chip on /search keeps the query and every other filter, so
 * its count has to equal what that combination returns — not just the count
 * for the unfiltered query (covered in catalog-search-categories.test.ts).
 *
 * The URL is built by `searchCategoryHref` and read back the way
 * `app/(shop)/search/page.tsx` reads it.
 */

function fromUrl(href: string) {
  const sp = new URL(href, "http://localhost").searchParams;
  const brands = sp.getAll("brand").flatMap((b) => b.split(","));
  return {
    search: sp.get("q") ?? undefined,
    categorySlug: sp.get("category") ?? undefined,
    brandSlugs: brands.length ? brands : undefined,
    minPaise: sp.get("minPrice") ? Number(sp.get("minPrice")) * 100 : undefined,
    maxPaise: sp.get("maxPrice") ? Number(sp.get("maxPrice")) * 100 : undefined,
    perPage: 48,
  };
}

test("with a brand filter on, each chip's count is what the chip opens", async () => {
  const open = await listProducts({ search: "cement", perPage: 48 });
  const brand = open.facets.brands.find((b) => b.count > 0);
  assert.ok(brand, "the seeded catalogue has no brand for 'cement'");

  const current = new URLSearchParams({ q: "cement", brand: brand.slug, sort: "price_asc", page: "2" });
  const filtered = await listProducts(fromUrl(`/search?${current}`));
  const chips = filtered.facets.categories ?? [];
  assert.ok(chips.length > 0);

  for (const c of chips) {
    const href = searchCategoryHref(current, c.slug);
    const url = new URL(href, "http://localhost").searchParams;
    assert.equal(url.get("q"), "cement");
    assert.equal(url.get("brand"), brand.slug, "the brand filter survives the chip");
    assert.equal(url.get("sort"), "price_asc");
    assert.equal(url.get("page"), null, "a chip starts the shelf at page 1");

    const shelf = await listProducts(fromUrl(href));
    assert.equal(shelf.total, c.count, `"${c.name} ${c.count}" with ${brand.slug} leads to ${shelf.total}`);
    assert.ok(shelf.items.every((i) => i.brandName === brand.name && i.categorySlug === c.slug));
  }
});

test("with a price range on, the counts still match", async () => {
  const current = new URLSearchParams({ q: "cement", minPrice: "300", maxPrice: "600" });
  const filtered = await listProducts(fromUrl(`/search?${current}`));
  for (const c of filtered.facets.categories ?? []) {
    const shelf = await listProducts(fromUrl(searchCategoryHref(current, c.slug)));
    assert.equal(shelf.total, c.count, `"${c.name} ${c.count}" within ₹300–600 leads to ${shelf.total}`);
  }
});

test("clearing the chip returns to the unscoped result", async () => {
  const current = new URLSearchParams({ q: "cement", category: "cement" });
  const cleared = searchCategoryHref(current, null);
  assert.equal(new URL(cleared, "http://localhost").searchParams.get("category"), null);
  const all = await listProducts({ search: "cement", perPage: 1 });
  assert.equal((await listProducts(fromUrl(cleared))).total, all.total);
});
