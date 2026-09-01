import assert from "node:assert/strict";
import test from "node:test";

import { speedLabel } from "@/lib/speed";

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
