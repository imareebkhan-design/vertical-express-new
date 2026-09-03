import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The product page must not tell a search engine a sold-out product is in stock.
 *
 * `components/mobile/product/product-switcher.tsx` emitted Product JSON-LD with
 * `availability: "https://schema.org/InStock"` as a literal, on every product,
 * for the life of the page. Structured data is a claim: Google renders it beside
 * the result as "In stock", and a shopper acts on it before the page loads. It
 * was independent of the inventory table, so it would have kept saying InStock
 * through a sell-out.
 *
 * It said so because it had nothing else to say — `getProductBySlug` fetched
 * variants without their inventory rows, so `ProductDetail` carried no stock at
 * all, while `toItem` (the card) and `searchEntries` both computed one from the
 * same three columns. The detail page was the only surface flying blind.
 *
 * Verified against vertical_express_demo, both directions: with 500 on hand and
 * 0 reserved the offer states InStock; with 500 reserved it states OutOfStock.
 *
 * The same block also priced a variant-less product at ₹0 (`?? 0`). No such
 * product exists today — a latent ₹0 listing rather than a live one — so the
 * offer is now omitted entirely when there is no variant to price.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const PDP = "components/mobile/product/product-switcher.tsx";
const CATALOG = "lib/services/catalog.ts";

/** Rendered code only: the comment above the offer block quotes the old literal
 *  to explain it, and must not satisfy the check it explains. */
const code = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

test("the product page still emits structured data", () => {
  /* Non-vacuity: with the JSON-LD deleted, or the comment stripper too greedy,
     every assertion below passes on an empty string. */
  const src = code(PDP);
  assert.match(src, /"@type": "Product"/, "the Product JSON-LD has gone");
  assert.match(src, /schema\.org/, "the offer no longer references schema.org");
});

test("availability is not a hardcoded string", () => {
  /* The defect exactly: a literal InStock with no conditional reaching it. */
  const src = code(PDP);
  const availability = /availability:\s*([^\n]*)/.exec(src);
  assert.ok(availability, "the offer no longer states availability at all");
  assert.ok(
    !/^\s*"https:\/\/schema\.org\/InStock",?\s*$/.test(availability[1]),
    "availability is the literal InStock, independent of the inventory table"
  );
  assert.match(
    src,
    /availability:[\s\S]{0,120}inStock/,
    "availability is not derived from the variant's stock"
  );
  assert.match(
    src,
    /schema\.org\/OutOfStock/,
    "no product can ever be reported out of stock"
  );
});

test("a product with no priceable variant states no offer", () => {
  /* `paiseToRupees(defaultVariant?.pricePaise ?? 0)` published a ₹0 price to
     Google for a product with no active variant. */
  const src = code(PDP);
  assert.ok(
    !/pricePaise\s*\?\?\s*0/.test(src),
    "a variant-less product is still priced at zero in structured data"
  );
  assert.match(
    src,
    /offers:\s*defaultVariant\s*\?/,
    "the offer is emitted even when there is no variant to price it from"
  );
});

test("the product detail carries the stock its structured data claims", () => {
  /* The root cause: getProductBySlug fetched variants without inventory, so the
     page could not have told the truth even if it had tried. */
  const src = code(CATALOG);
  assert.match(
    src,
    /bulkTiers:\s*\{\s*orderBy:\s*\{\s*minQty:\s*"asc"\s*\}\s*\},\s*inventory:\s*true/,
    "getProductBySlug no longer fetches the inventory rows"
  );
  assert.match(
    src,
    /inStock:\s*\n?\s*\(v\.inventory/,
    "ProductDetail variants no longer carry a computed inStock"
  );
});
