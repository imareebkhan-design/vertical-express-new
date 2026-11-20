import test from "node:test";
import assert from "node:assert/strict";
import type { ProductDetail } from "@/lib/services/catalog";
import { categoryBreadcrumbJsonLd, productJsonLd } from "@/lib/seo/structured-data";
import { serializeJsonLdAsHtml } from "@/lib/json-ld";

/**
 * The product and breadcrumb JSON-LD moved out of the client switchers (which
 * render only a loader on the server) into the server pages (ISS-108 staging
 * smoke check). The data they state must not change in the move.
 */

function product(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    slug: "ppc-cement-50kg",
    title: "PPC Cement, 50 kg Bag",
    description: "Portland pozzolana cement.",
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
    images: [{ url: "https://img.example/a.jpg", alt: "bag" }],
    purchasable: true,
    variants: [
      { id: "v1", name: "50 kg", sku: "C50", pricePaise: 42000, compareAtPaise: null, isDefault: true, bulkTiers: [], inStock: true },
    ],
    ...over,
  };
}

test("a product states name, brand, images and an INR offer from the default variant", () => {
  const ld = productJsonLd(product());
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.name, "PPC Cement, 50 kg Bag");
  assert.deepEqual(ld.brand, { "@type": "Brand", name: "UltraTech" });
  assert.deepEqual(ld.image, ["https://img.example/a.jpg"]);
  assert.deepEqual(ld.offers, { "@type": "Offer", priceCurrency: "INR", price: 420, availability: "https://schema.org/InStock" });
});

test("availability follows stock", () => {
  const ld = productJsonLd(product({ variants: [{ ...product().variants[0], inStock: false }] }));
  assert.equal(ld.offers?.availability, "https://schema.org/OutOfStock");
});

test("a catalog-only product with no variants states no offer", () => {
  assert.equal(productJsonLd(product({ purchasable: false, variants: [] })).offers, undefined);
});

test("no rating is claimed while there are no reviews", () => {
  assert.equal("aggregateRating" in productJsonLd(product()), false);
});

test("a hostile product title survives serialisation as data, not markup", () => {
  const html = serializeJsonLdAsHtml(productJsonLd(product({ title: "Drill </script><b>x</b>" })));
  assert.equal(html.includes("<"), false);
  assert.equal(JSON.parse(html).name, "Drill </script><b>x</b>");
});

test("the category breadcrumb is Home › Categories › category", () => {
  const ld = categoryBreadcrumbJsonLd("Cement");
  assert.equal(ld["@type"], "BreadcrumbList");
  assert.deepEqual(
    ld.itemListElement.map((i) => [i.position, i.name]),
    [[1, "Home"], [2, "Categories"], [3, "Cement"]]
  );
});
