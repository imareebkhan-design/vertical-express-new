import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * The product and category pages must emit their JSON-LD from the server
 * component itself. The client switchers render only a loader until the
 * browser reports its screen size, so a block placed inside them never reached
 * the server HTML (found by the ISS-108 staging smoke check).
 *
 * The switchers are replaced with stubs that render nothing: whatever JSON-LD
 * appears in the markup below came from the page, not from a client component.
 */

const product = {
  id: "p1",
  slug: "ppc-cement-50kg",
  title: "PPC Cement </script><b>x</b>",
  description: null,
  brandName: "UltraTech",
  brandSlug: "ultratech",
  categoryName: "Cement",
  categorySlug: "cement",
  categoryIsBulk: true,
  deliverySpeed: null,
  unitLabel: "bag",
  specs: [],
  ratingAvg: 0,
  ratingCount: 0,
  images: [],
  purchasable: true,
  variants: [{ id: "v1", name: "50 kg", sku: "C50", pricePaise: 42000, compareAtPaise: null, isDefault: true, bulkTiers: [], inStock: true }],
};

mock.module("@/lib/services/catalog", {
  namedExports: {
    getProductBySlug: async () => product,
    getRelatedProducts: async () => [],
    boughtWithProduct: async () => [],
    listProductSlugs: async () => [],
    getCategoryBySlug: async () => ({ id: "c1", slug: "cement", name: "Cement" }),
    listCategorySlugs: async () => [],
    listProducts: async () => ({ items: [], total: 0, page: 1, perPage: 24, brands: [], priceRange: null, attributeFacets: [] }),
    mostOrderedInCategory: async () => [],
    brandsInCategory: async () => [],
    listCategoryDirectory: async () => [],
    visibleProductCount: async () => 3,
  },
});
mock.module("@/components/mobile/product/product-switcher", { namedExports: { ProductSwitcher: () => null } });
mock.module("@/components/mobile/category/category-switcher", { namedExports: { CategorySwitcher: () => null } });

function blocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

test("the product page server-renders a Product block, escaped", async () => {
  const { default: ProductPage } = await import("@/app/(shop)/product/[slug]/page");
  const element = (await ProductPage({ params: Promise.resolve({ slug: "ppc-cement-50kg" }) })) as ReactElement;
  const html = renderToStaticMarkup(element);
  const found = blocks(html) as { "@type": string; name: string }[];
  assert.equal(found.length, 1);
  assert.equal(found[0]["@type"], "Product");
  assert.equal(found[0].name, "PPC Cement </script><b>x</b>");
  assert.equal(html.match(/<\/script>/g)?.length, 1, "the hostile title did not close the tag");
});

test("the category page server-renders its BreadcrumbList", async () => {
  const { default: CategoryPage } = await import("@/app/(shop)/category/[slug]/page");
  const element = (await CategoryPage({
    params: Promise.resolve({ slug: "cement" }),
    searchParams: Promise.resolve({}),
  })) as ReactElement;
  const found = blocks(renderToStaticMarkup(element)) as { "@type": string; itemListElement: { name: string }[] }[];
  assert.equal(found.length, 1);
  assert.equal(found[0]["@type"], "BreadcrumbList");
  assert.equal(found[0].itemListElement[2].name, "Cement");
});
