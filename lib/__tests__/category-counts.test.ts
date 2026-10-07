import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A category tile must not advertise a number of products.
 *
 * `components/sections/categories.tsx` shipped a count per tile as a literal
 * string, on the home page, above the fold on desktop:
 *
 *   Cement "23 products"          Wires & MCB "74 products"
 *   Tiling "148 products"         Switches "55 products"
 *   Painting "96 products"        Lighting "112 products"
 *   Waterproofing "41 products"   Ceiling fans "29 products"
 *   Plywood & MDF "62 products"   CPVC & tanks "67 products"
 *   Adhesives "38 products"       Sanitary & bath "134 products"
 *
 * 879 products across twelve categories that hold 30 between them, in a
 * catalogue of 45. It is the same claim as the "4,100 products" removed from
 * the hero in d86a85d, one component further down the same page — which is why
 * this is not a stale number but a category of mistake: nothing made it wrong,
 * it was written wrong and had no way of becoming right.
 *
 * Verified in the browser at 1280px after the fix, against the demo database:
 * every tile now renders the count the database returns (Cement 4, Tiling 3,
 * Painting 3, Waterproofing 3, Wires & MCB 3, the rest 2).
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Rendered copy only — the comment above the tile list quotes the old figures
 *  to explain them, and must not itself trip the check. */
const rendered = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

const tiles = rendered("components/sections/categories.tsx");

test("the category section still renders its tiles", () => {
  /* Non-vacuity: an over-eager comment stripper, or a deleted section, would
     satisfy every assertion below on an empty string. */
  assert.match(tiles, /Shop by category/, "the category section copy has gone");
  assert.match(tiles, /CATEGORY_GROUPS/, "the tile list no longer comes from the category taxonomy");
});

test("no tile carries a hardcoded product count", () => {
  /* Any literal of the shape "<number> products" is a claim about the
     catalogue written into a component, where nothing can correct it. */
  const literals = [...tiles.matchAll(/"(\d[\d,]*\s+products?)"/g)].map((m) => m[1]);
  assert.deepEqual(
    literals,
    [],
    `the category tiles hardcode product counts: ${literals.join(", ")}`
  );
});

test("which tiles show comes from the categories query", () => {
  /* Tiles no longer print a count (8 Oct 2026: noise to a shopper). The real
     count from `listCategories()` still decides which categories appear. */
  assert.match(
    tiles,
    /counts\[c\.slug\]/,
    "the tiles no longer read the real counts passed in"
  );

  const catalog = rendered("lib/services/catalog.ts");
  assert.match(
    catalog,
    /_count:\s*\{\s*select:\s*\{\s*products:\s*\{\s*where:\s*\{\s*status:\s*"published"\s*\}/,
    "listCategories no longer counts published products per category"
  );

  const home = rendered("app/page.tsx");
  assert.match(
    home,
    /c\._count\.products/,
    "the home page no longer passes the real counts to the tiles"
  );
});

test("an empty category is left out rather than shown as a dead tile", () => {
  /* A tile for a shelf with nothing on it leads nowhere. It is filtered out on
     the real count, never labelled with a zero. */
  assert.match(tiles, /\(counts\[c\.slug\] \?\? 0\) > 0/, "empty categories are no longer filtered out");
  assert.doesNotMatch(tiles, /\$\{counts\[/, "a tile prints a product count again");
});
