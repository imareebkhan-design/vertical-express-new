import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The first screen must not promise what the shop cannot do.
 *
 * The hero carried six claims and every one of them was false against the
 * database or the code:
 *
 *   "4,100 products"        — the catalogue holds 45.
 *   "from UltraTech, ACC, Asian Paints, Century Ply, Havells, Finolex,
 *    Jaquar and Hindware" — zero products sit under any of those brands.
 *   "60 min"                — the express window is unverified and unset.
 *   "On a slot you pick at checkout" — slot selection does not exist at all.
 *   "up to ₹50,000 per shipment"     — COD is off, and no ceiling was ever set.
 *   "seasonal items show 5–7 days"   — no seasonal rule exists or is applied.
 *
 * These are worse than the same claims elsewhere because this is the page
 * everybody sees, and a customer plans a purchase on it before discovering any
 * of it is wrong. The brand list is the most serious: naming eight real
 * manufacturers as suppliers when you stock none of their products is a
 * statement about other people's businesses.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Rendered copy only — a comment explaining why a claim was removed must not
 *  itself trip the check. */
const hero = readFileSync(join(ROOT, "components/sections/hero.tsx"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ");

test("the hero still renders something", () => {
  /* Non-vacuity: an over-eager comment stripper would empty the file and make
     every assertion below pass. */
  assert.match(hero, /Building material/, "the hero copy has gone");
});

test("no product count is advertised", () => {
  /* A count on the first line is a claim about how much of a customer's list
     can be filled. It was 91x out. Any number followed by "products" is
     suspect — it drifts the moment the catalogue changes. */
  assert.ok(
    !/[\d,]{3,}\s*products/i.test(hero),
    "the hero advertises a product count, which will drift from the catalogue"
  );
});

test("no real manufacturer is named as a supplier", () => {
  /* Every product in the catalogue sits under an invented brand (ISS-007).
     Until the owner assigns products to real brands, naming them here says we
     stock things we do not. */
  for (const brand of [
    "UltraTech",
    "ACC",
    "Ambuja",
    "Asian Paints",
    "Century Ply",
    "Havells",
    "Finolex",
    "Jaquar",
    "Hindware",
    "Kajaria",
    "Somany",
  ]) {
    assert.ok(
      !new RegExp(`\\b${brand}\\b`).test(hero),
      `the hero names ${brand} as a supplier, and no product is assigned to that brand`
    );
  }
});

test("no delivery time is promised", () => {
  /* The express window is an owner setting and is deliberately empty. The
     product speed chip already had its 60-minute default removed (ISS-054);
     the hero kept one. */
  assert.ok(!/\b60\s*min/i.test(hero), "the hero promises a 60-minute delivery");
  assert.ok(
    !/\b\d+\s*(?:–|-|to )\s*\d+\s*days?\b/i.test(hero),
    "the hero promises a lead time in days"
  );
});

test("no slot selection is offered", () => {
  /* There is no slot model, no slot screen and nothing in checkout that offers
     a window (ISS-057). */
  assert.ok(
    !/slot you pick|pick a slot|choose a slot/i.test(hero),
    "the hero says a delivery slot can be chosen at checkout; slots do not exist"
  );
});

test("no COD ceiling is advertised", () => {
  /* COD is off shop-wide, and the ceiling is a policy the owner has not set. */
  assert.ok(
    !/₹\s?[\d,]+\s*per shipment/i.test(hero),
    "the hero advertises a COD ceiling that nobody set"
  );
});

/**
 * The downloads strip on the home page must not offer a document that does not
 * exist.
 *
 * It carried three rows with a Download icon, a validity window ("valid 1–30
 * Sep 2026") and an edition year — and no link, no file, and no PDF anywhere in
 * public/. /downloads had already been fixed properly: every control there is
 * an inert "Not published" beside a note that the figures are stand-ins. The
 * entry point had not, so an honest page sat behind a strip implying the
 * documents were ready.
 *
 * Brand names are not the issue and are not checked here — the owner has
 * confirmed the brand agreements are signed and the names may be used.
 */
const strip = readFileSync(join(ROOT, "components/sections/downloads-strip.tsx"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ");

test("the downloads strip still renders", () => {
  assert.match(strip, /Price lists/, "the strip has gone");
});

test("the strip offers no document that does not exist", () => {
  /* A Download affordance with nothing behind it. Every row is inert and says
     so, matching /downloads. */
  assert.ok(
    !/<Download\b/.test(strip),
    "the strip shows a download control, but no PDF exists in public/"
  );
  assert.match(strip, /Not published/, "the rows no longer say they are unpublished");
});

test("the strip dates nothing it cannot honour", () => {
  /* "valid 1–30 Sep 2026" on a trade price list is the worst version of this:
     a contractor prices a job against a validity window. */
  assert.ok(
    !/valid\s+\d/i.test(strip),
    "the strip states a validity window for a price list that does not exist"
  );
  assert.ok(
    !/\d{4}\s+edition/i.test(strip),
    "the strip states an edition year for a catalogue that does not exist"
  );
});
