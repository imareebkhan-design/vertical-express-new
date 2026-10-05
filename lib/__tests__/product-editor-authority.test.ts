import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The console does not become a second pricing authority.
 *
 * Artboard 10 draws a "Variants and pricing" table with MRP and Selling
 * columns, and it is a short step from drawing those to putting an input in
 * them. That step would be expensive. Price is server-authoritative on purpose
 * — the cart sends a variant and a quantity and never a price — and a text box
 * on this screen is a way in that has none of the guarantees the checkout path
 * has. GST rate and HSN are worse: they are set per category from
 * owner-confirmed configuration, and a rate typed on the wrong screen is a tax
 * error on every order in that category, discovered by an accountant months
 * later.
 *
 * Tax stays read-only here. Price became editable on 5 Oct 2026 (ISS-068, an
 * owner decision): only per variant, only through `adminSetVariantPrice`, which
 * parses rupee text on the server, refuses a save made from a stale screen and
 * audits the change in the same transaction. The general product save still
 * accepts no money, tax or stock field, and the product form binds no price.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EDITOR = readFileSync(join(ROOT, "components/admin/product-editor.tsx"), "utf8");
const ACTION = readFileSync(join(ROOT, "actions/products.ts"), "utf8");
const ROW = readFileSync(join(ROOT, "components/admin/variant-price-row.tsx"), "utf8");

/** A slice of source between two markers, failing loudly if either is missing. */
function between(src: string, start: string, end: string): string {
  const i = src.indexOf(start), j = src.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `markers not found: ${start} … ${end}`);
  return src.slice(i, j);
}
/** The general product save: its input schema and its body. */
const SAVE_ACTION = between(ACTION, "const schema = z.object(", "Changing a variant's price");
/** The product form. The per-variant price rows live in their own component. */
const PRODUCT_FORM = between(EDITOR, "export function ProductEditor", "function Section");
/** The only place a price may be edited. */
const PRICE_ROW = between(ROW, "export function VariantPriceRow", "\n}\n");

/** The editor is a form, so it must genuinely contain form controls. */
test("the editor really is a form", () => {
  assert.ok(
    /<input|<select/.test(EDITOR),
    "no form controls found — this guard would pass vacuously"
  );
});

test("the product form binds no price; only the variant price row does, through its own action", () => {
  /* Matched on the identifiers a price field would have to bind to, not on the
     word "price" — the column headings and the explanatory note both mention
     prices, and should. */
  for (const bound of ["pricePaise", "compareAtPaise", "mrp"]) {
    const controlled = new RegExp(`(value|defaultValue)=\\{[^}]*${bound}`, "i");
    assert.ok(
      !controlled.test(PRODUCT_FORM),
      `${bound} is bound to a control in the product form. A price is changed only ` +
        `through adminSetVariantPrice, which checks it was not changed meanwhile and audits it.`
    );
  }
  assert.ok(
    /<VariantPriceRow[^>]*save=\{adminSetVariantPrice\}/.test(EDITOR),
    "the editor must give the variant price row adminSetVariantPrice as its save"
  );
  assert.ok(!/adminSaveProduct\(/.test(PRICE_ROW), "the variant price row must not save through adminSaveProduct");
  assert.ok(/shownPricePaise/.test(PRICE_ROW), "the price row must send the price it showed, so a stale save is refused");
});

test("no field on the editor writes a tax rate or HSN", () => {
  for (const bound of ["gstRatePct", "hsn"]) {
    const controlled = new RegExp(`(value|defaultValue)=\\{[^}]*${bound}`, "i");
    assert.ok(
      !controlled.test(EDITOR),
      `${bound} is bound to a form control. Tax is configured per category ` +
        `from owner-confirmed values, not typed per product.`
    );
  }
});

test("the save action accepts no price, tax or stock field", () => {
  /* The component is only the front of it. An action that accepted a price
     would be reachable by anyone who can post to it, form or no form. */
  for (const forbidden of ["pricePaise", "compareAtPaise", "price", "mrp", "gstRatePct", "hsn", "ratePct", "qtyOnHand"]) {
    assert.ok(
      !new RegExp(`\\b${forbidden}\\b`).test(SAVE_ACTION),
      `adminSaveProduct mentions ${forbidden}. This action edits catalogue ` +
        `copy and routing only — money and stock have their own paths.`
    );
  }
});

test("no action in this file writes tax or stock", () => {
  for (const forbidden of ["gstRatePct", "hsn", "ratePct", "qtyOnHand", "qtyReserved"]) {
    assert.ok(!ACTION.includes(forbidden), `actions/products.ts mentions ${forbidden}; tax and stock are not edited here`);
  }
});

test("the delivery-speed field offers no time in minutes", () => {
  /* The express window is unconfirmed (ISS-054 was exactly this: a component
     defaulting to 60 minutes, which is a promise nobody made). The option
     labels describe the class of delivery, not a duration. */
  assert.ok(
    !/\b\d{2,3}\s*min/.test(EDITOR),
    "a delivery time in minutes appears in the editor; the express window is " +
      "not owner-confirmed"
  );
});
