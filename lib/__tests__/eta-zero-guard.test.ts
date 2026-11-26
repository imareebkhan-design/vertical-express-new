import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A pincode with no delivery promise must not read as a delivery promise.
 *
 * `ServiceablePincode.etaMinutes` is 0 when an operator has deliberately chosen
 * "no promise" — a state the serviceability editor offers because no delivery
 * window is confirmed and the column otherwise defaults to an unverified 60.
 *
 * The first version of this test named two files and matched the literal string
 * "Delivering in ~". That was too narrow, and its docstring said it covered
 * every surface that prints an ETA, which was not true: four more surfaces
 * phrase it differently and three of them were wrong. Against pincode 190001,
 * which carries 0 in the demo data:
 *
 *   mobile-product-view.tsx   {pinResult.etaMinutes || "60"}
 *                             ->  "Deliverable: ETA 60 mins to 190001"
 *   mobile-checkout-view.tsx  `ETA ~${totals.etaMinutes} mins`
 *                             ->  "ETA ~0 mins"
 *   confirmation (x2)         etaMinutes ? … : "Soon"
 *                             ->  "Soon"
 *
 * The first is the worst defect of the three and the opposite of a missing
 * guard: it does not misread absence, it replaces it with a fabricated sixty
 * minutes — the same "60 min" claim removed from the hero in d86a85d as
 * unverified, reappearing in a component nobody was looking at. The last is
 * guarded correctly and still promises, because "Soon" is a commitment.
 *
 * So the surface list is no longer written down. It is discovered by reading
 * the tree, which is the only version of this test that can catch the next one.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Rendered copy only — an explanation that quotes a removed claim must not
 *  itself trip the check. */
const rendered = (abs: string) =>
  readFileSync(abs, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

/**
 * Every customer-facing component that reads etaMinutes, found rather than
 * listed. `/admin` is excluded: the serviceability editor is where 0 is *set*,
 * and it renders the word "none" for it deliberately.
 */
const SURFACES: { rel: string; src: string }[] = [
  ...walk(join(ROOT, "components")),
  ...walk(join(ROOT, "app")),
]
  .filter((abs) => !abs.includes("/admin/"))
  .map((abs) => ({ rel: relative(ROOT, abs), src: rendered(abs) }))
  .filter((f) => /etaMinutes/.test(f.src));

test("delivery-time surfaces are still being found", () => {
  /* Non-vacuity. If the walk breaks, or the components move, every assertion
     below passes by inspecting nothing — which is exactly how the hardcoded
     list let three defects through. */
  assert.ok(
    SURFACES.length >= 5,
    `only ${SURFACES.length} components read etaMinutes; the sweep is not finding them`
  );
  for (const expected of [
    "components/shop/pincode-check.tsx",
    "components/shop/checkout-view.tsx",
    "components/mobile/product/mobile-product-view.tsx",
    "components/mobile/checkout/mobile-checkout-view.tsx",
  ]) {
    assert.ok(
      SURFACES.some((f) => f.rel === expected),
      `${expected} is no longer among the surfaces that read etaMinutes`
    );
  }
});

test("no surface prints a delivery time without checking there is one", () => {
  /* Any interpolation of etaMinutes into copy — whatever the wording — needs a
     check on the same value. Three guard shapes are in use, and all three
     exclude 0 because 0 is falsy: `etaMinutes &&`, `etaMinutes ?` and an
     explicit `> 0`. */
  for (const { rel, src } of SURFACES) {
    const interpolates =
      /\$\{[^}]*etaMinutes[^}]*\}/.test(src) || /\{[^}]*\betaMinutes\b[^}]*\}\s*(min|mins)/.test(src);
    if (!interpolates) continue;

    const guarded =
      /etaMinutes\s*&&/.test(src) ||
      /etaMinutes\s*>\s*0/.test(src) ||
      /etaMinutes\s*\?[^?]/.test(src);
    assert.ok(
      guarded,
      `${rel} prints a delivery time from etaMinutes with no check that one exists. ` +
        `0 means an operator set "no promise" for that pincode.`
    );
  }
});

test("no surface substitutes a delivery time when there is none", () => {
  /* The `|| "60"` defect: a fallback that supplies a number rather than
     admitting the absence. Any numeric literal defaulted from etaMinutes is
     a promise nobody made. */
  for (const { rel, src } of SURFACES) {
    assert.ok(
      !/etaMinutes\s*\|\|\s*["'`]?\d/.test(src),
      `${rel} falls back to a hardcoded delivery time when etaMinutes is absent`
    );
    assert.ok(
      !/etaMinutes\s*\?\?\s*\d/.test(src),
      `${rel} defaults etaMinutes to a number, which reads as a promise`
    );
  }
});

test("the absent case does not promise a time in words", () => {
  /* "Soon" passed the guard above and still committed us. A surface that has
     an absent branch must not fill it with a vaguer promise. */
  for (const { rel, src } of SURFACES) {
    assert.ok(
      !/etaMinutes[^\n]{0,120}:\s*"(Soon|Shortly|Today|Fast|Quick)"/i.test(src),
      `${rel} promises a delivery time in words where etaMinutes is absent`
    );
  }
});
