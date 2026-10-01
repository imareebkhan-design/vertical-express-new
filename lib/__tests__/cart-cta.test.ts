import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The checkout button must not name a step the checkout cannot run.
 *
 * The desktop cart's primary action read "Choose delivery slots". Slot booking
 * does not exist in any form (ISS-057) — no Slot model, and `Shipment.promisedAt`
 * stays null until one does. Checkout renders the step honestly, behind a
 * PlaceholderValue saying slot booking is not built, so the button promised
 * exactly what the next screen withdraws. It is the highest-intent control on
 * the site and the mobile cart already said "Checkout".
 *
 * The pattern is the one that keeps recurring: a summary surface asserting what
 * the detail surface behind it calls unknown. It reached a button here rather
 * than a paragraph.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Rendered copy only — the comment explaining the change quotes the old label. */
const rendered = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

const desktop = rendered("components/shop/cart-view.tsx");
const mobile = rendered("components/mobile/cart/mobile-cart-view.tsx");

test("both carts still render a way to check out", () => {
  /* Non-vacuity: an over-eager comment stripper, or a deleted button, would
     make the assertions below pass on nothing. */
  assert.match(desktop, /href="\/checkout"/, "the desktop cart has no checkout link");
  assert.match(mobile, /href="\/checkout"/, "the mobile cart has no checkout link");
  assert.match(desktop, /Order summary/, "the desktop cart copy has gone");
});

test("no cart offers to choose a delivery slot", () => {
  /* Checkout's slot section is behind a PlaceholderValue reading "slot booking
     is not built". A button may not promise past it. */
  for (const [name, src] of [["desktop", desktop], ["mobile", mobile]] as const) {
    assert.ok(
      !/choose delivery slot|choose a slot|pick a slot|select .{0,12}slot/i.test(src),
      `the ${name} cart offers to choose a delivery slot; slot booking does not exist`
    );
  }
});

test("the checkout step still marks slots as unbuilt rather than offering them", () => {
  /* The other end of the same claim. If this ever renders a real slot picker,
     the button may say so again — and this test should be the thing that
     changes. */
  /* The step moved into a shared component (Batch 3B, W-B1-G1) so the phone
     checkout shows it too; both checkouts must render it, and it must still
     declare itself unbuilt. */
  const review = readFileSync(join(ROOT, "components/shop/checkout/shipment-review.tsx"), "utf8");
  assert.match(
    review,
    /PlaceholderValue pending="slot booking is not built/,
    "the checkout slot step no longer declares itself unbuilt"
  );
  for (const view of ["components/shop/checkout-view.tsx", "components/mobile/checkout/mobile-checkout-view.tsx"]) {
    assert.match(rendered(view), /<ShipmentReview /, `${view} no longer renders the shipment step`);
  }
});
