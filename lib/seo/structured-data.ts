import type { ProductDetail } from "@/lib/services/catalog";
import { paiseToRupees } from "@/lib/money";

/**
 * Structured data for the product and category pages.
 *
 * Built on the server and rendered by the page itself, not by the client
 * switchers: those render only a loader until the browser reports its screen
 * size, so JSON-LD placed inside them never reached the server HTML, and the
 * mobile views carried none at all (found by the ISS-108 staging smoke check).
 */
export function productJsonLd(product: ProductDetail) {
  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    brand: { "@type": "Brand", name: product.brandName },
    image: product.images.map((i) => i.url),
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
    /* `availability` was the string "https://schema.org/InStock", hardcoded, on
       every product. Structured data is a claim to a search engine that shows
       up beside the result as "In stock", and this one was independent of the
       inventory table — it stayed InStock through a sell-out. The PDP had no
       stock data to state it from, because getProductBySlug never fetched the
       inventory rows; it does now, so the claim follows the stock.

       An offer with no default variant states no price and no availability
       rather than ₹0 and in stock. */
    offers: defaultVariant
      ? {
          "@type": "Offer",
          priceCurrency: "INR",
          price: paiseToRupees(defaultVariant.pricePaise),
          availability: defaultVariant.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        }
      : undefined,
  };
}

/** BreadcrumbList for a category page: Home › Categories › <category>. */
export function categoryBreadcrumbJsonLd(categoryName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Categories", item: "/categories" },
      { "@type": "ListItem", position: 3, name: categoryName },
    ],
  };
}
