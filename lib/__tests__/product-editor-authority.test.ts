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
 * Both are rendered read-only. This asserts they stay that way. Making them
 * editable is a decision that should require deleting a test that says why.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EDITOR = readFileSync(join(ROOT, "components/admin/product-editor.tsx"), "utf8");
const ACTION = readFileSync(join(ROOT, "actions/products.ts"), "utf8");

/** The editor is a form, so it must genuinely contain form controls. */
test("the editor really is a form", () => {
  assert.ok(
    /<input|<select/.test(EDITOR),
    "no form controls found — this guard would pass vacuously"
  );
});

test("no field on the editor writes a price", () => {
  /* Matched on the identifiers a price field would have to bind to, not on the
     word "price" — the column headings and the explanatory note both mention
     prices, and should. */
  for (const bound of ["pricePaise", "compareAtPaise", "mrp"]) {
    const controlled = new RegExp(`(value|defaultValue)=\\{[^}]*${bound}`, "i");
    assert.ok(
      !controlled.test(EDITOR),
      `${bound} is bound to a form control. Price is resolved on the server; ` +
        `editing it here bypasses every guarantee the checkout path has.`
    );
  }
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
  for (const forbidden of [
    "pricePaise",
    "compareAtPaise",
    "gstRatePct",
    "hsn",
    "ratePct",
    "qtyOnHand",
  ]) {
    assert.ok(
      !ACTION.includes(forbidden),
      `adminSaveProduct mentions ${forbidden}. This action edits catalogue ` +
        `copy and routing only — money and stock have their own paths.`
    );
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
