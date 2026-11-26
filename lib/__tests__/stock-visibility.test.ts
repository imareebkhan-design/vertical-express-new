import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A customer must be told an item is out of stock before they try to buy it.
 *
 * Neither the product card nor the product page knew anything about stock. Both
 * rendered a quantity stepper and a live "Add to cart" on an item with nothing
 * on the shelf, and `lib/services/cart.ts` refused it — correctly, with
 * OUT_OF_STOCK — only once the button was pressed. Nothing was ever oversold;
 * the customer simply found out last, after picking a quantity.
 *
 * The data was already there and unused. `CatalogItem.inStock` has been
 * computed for the card's service since it was written, and `ProductDetail`
 * gained a per-variant `inStock` in 7a29b71 when the same absence turned out to
 * be publishing "InStock" to Google on every product regardless of the
 * warehouse.
 *
 * Per variant on the product page rather than per product: a 50 kg bag being
 * sold out says nothing about the 25 kg one, and the variant is what goes in
 * the cart.
 *
 * Verified in the browser against vertical_express_demo, with ppc-cement-50kg
 * forced to zero free stock: both the desktop and the sticky mobile buttons
 * read "Out of stock" and came back `disabled: true`, while the in-stock
 * related products on the same page stayed enabled.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Rendered code only — the comments explaining the fix describe the defect. */
const code = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

const card = code("components/product-card.tsx");
const pdp = code("components/shop/pdp-actions.tsx");
const grid = code("components/shop/catalog-grid.tsx");

test("both purchase surfaces still render", () => {
  /* Non-vacuity: a deleted button, or an over-eager comment stripper, would
     satisfy every assertion below on an empty string. */
  assert.match(card, /onClick=\{handleAdd\}/, "the card's add button has gone");
  assert.match(pdp, /onClick=\{handleAdd\}/, "the product page's add button has gone");
});

test("the card knows whether the item is in stock", () => {
  /* The service computed it and the grid dropped it on the floor. */
  assert.match(grid, /inStock: item\.inStock/, "the grid no longer passes stock to the card");
  assert.match(card, /product\.inStock/, "the card no longer reads the stock state");
});

test("no add control is live on an item with no stock", () => {
  for (const [name, src] of [["the card", card], ["the product page", pdp]] as const) {
    /* Every add button must be disabled by the sold-out flag. Counting rather
       than matching once: the product page has two (desktop and the sticky
       mobile bar) and only one of them was the obvious one. */
    const addButtons = (src.match(/onClick=\{handleAdd\}/g) ?? []).length;
    const disabled = (src.match(/disabled=\{soldOut\}/g) ?? []).length;
    assert.ok(addButtons > 0, `${name} has no add button`);
    assert.ok(
      disabled >= addButtons,
      `${name} has ${addButtons} add buttons but only ${disabled} disabled when sold out`
    );
  }
});

test("the sold-out state is stated, not just disabled", () => {
  /* A greyed button with no words reads as a broken page. */
  assert.match(card, /Out of stock|Sold out/, "the card never says the item is out of stock");
  assert.match(pdp, /Out of stock/, "the product page never says the item is out of stock");
});

test("the product page decides per variant, not per product", () => {
  /* `product.inStock` does not exist and must not be invented: stock lives on
     the variant, which is what the cart receives. */
  assert.match(
    pdp,
    /soldOut\s*=\s*!variant\.inStock/,
    "the product page no longer takes stock from the selected variant"
  );
});
