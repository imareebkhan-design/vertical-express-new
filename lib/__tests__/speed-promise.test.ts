import assert from "node:assert/strict";
import test from "node:test";

import { speedLabel, speedClassFor } from "@/lib/speed";

/**
 * A delivery window is a promise, and a promise belongs to the owner.
 *
 * `speedLabel` defaulted its `etaMinutes` parameter to 60. Eight call sites
 * passed nothing, so eight surfaces rendered "60 min" — the unverified delivery
 * claim (ISS-054), materialised at render time rather than written anywhere.
 *
 * It survived every copy sweep because it is not copy. Grepping the pages for
 * "60 minutes" finds nothing; the number only exists once React runs.
 *
 * The rule now: no number unless somebody set one.
 */

test("with no window set, the chip promises no time", () => {
  assert.equal(speedLabel("express"), "Fast");
  assert.equal(speedLabel("express", null), "Fast");
  assert.equal(speedLabel("express", undefined), "Fast");
});

test("a window that has been set is shown", () => {
  assert.equal(speedLabel("express", 45), "45 min");
  assert.equal(speedLabel("express", 90), "90 min");
});

test("no default sneaks back in", () => {
  /* The regression, stated directly: calling with no argument must not produce
     a figure. If this ever reads "60 min" again, somebody has reintroduced a
     promise nobody made. */
  const label = speedLabel("express");
  assert.ok(!/\d/.test(label), `"${label}" contains a number nobody configured`);
});

test("classes that do not depend on a window are unaffected", () => {
  assert.equal(speedLabel("scheduled"), "Heavy — by truck");
  assert.equal(speedLabel("seasonal"), "Seasonal");
});

test("lead time no longer claims a fixed number of days", () => {
  /* It said "2–3 days", hardcoded, for the same reason and with the same
     problem. */
  const label = speedLabel("leadtime");
  assert.ok(!/\d/.test(label), `"${label}" claims a lead time nobody set`);
});

test("a product's own speed beats its category's", () => {
  /* The category is the rule and the product is the exception. Category.isBulk
     is right for most of the catalogue and wrong at the edges — a 5 kg bag of
     white cement does not need a truck, a 40-piece box of tiles does. */
  assert.equal(speedClassFor(true), "scheduled", "a bulk category defaults to truck");
  assert.equal(speedClassFor(true, "express"), "express", "the product overrides it");
  assert.equal(speedClassFor(false, "scheduled"), "scheduled", "and in the other direction");
});

test("no override means the category decides", () => {
  /* Null is the normal case and must never be mistaken for a choice. */
  assert.equal(speedClassFor(true, null), "scheduled");
  assert.equal(speedClassFor(false, null), "express");
  assert.equal(speedClassFor(true, undefined), "scheduled");
});
