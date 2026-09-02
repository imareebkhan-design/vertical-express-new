import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A pincode with no delivery promise must not read as instant delivery.
 *
 * `ServiceablePincode.etaMinutes` is 0 when an operator has deliberately chosen
 * "no promise" — a state the serviceability editor offers because no delivery
 * window is confirmed and the column otherwise defaults to an unverified 60.
 *
 * `pincode-check.tsx` rendered it unguarded:
 *
 *     Delivering in ~{result.etaMinutes} min      →  "Delivering in ~0 min"
 *
 * Verified against the demo data, where pincode 190001 carries 0. "~0 min"
 * reads as instant, which is the strongest possible delivery promise made by
 * the value that means no promise at all.
 *
 * This defect is reachable only through the editor added in this same body of
 * work, which is a good reason to hold it to the same standard as the rest.
 * The checkout view already guarded the same field; this component did not.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const rendered = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

/** Every component that prints a delivery time from etaMinutes. */
const SURFACES = [
  "components/shop/pincode-check.tsx",
  "components/shop/checkout-view.tsx",
];

test("the surfaces still render a delivery time at all", () => {
  /* Non-vacuity — a component that stopped showing the ETA entirely would
     satisfy the guard below for the wrong reason. */
  for (const rel of SURFACES) {
    assert.match(
      rendered(rel),
      /etaMinutes/,
      `${rel} no longer references etaMinutes`
    );
  }
});

test("no surface prints a delivery time without checking there is one", () => {
  for (const rel of SURFACES) {
    const src = rendered(rel);

    /* Find every interpolation of etaMinutes into visible copy, and require a
       guard on the same value somewhere in the file. The guard shapes in use
       are `totals.etaMinutes &&` (truthiness, which excludes 0) and an explicit
       `> 0`. */
    if (!/Delivering in ~\$\{?result\.etaMinutes|Delivering in ~\{totals\.etaMinutes\}|Delivering in ~\$\{result\.etaMinutes\}/.test(src)) {
      // The file may phrase it differently; fall through to the generic check.
    }

    const printsEta = /Delivering in ~/.test(src);
    if (!printsEta) continue;

    const guarded =
      /etaMinutes\s*&&/.test(src) || /etaMinutes\s*>\s*0/.test(src);
    assert.ok(
      guarded,
      `${rel} prints a delivery time from etaMinutes with no check that one exists. ` +
        `A pincode set to "no promise" carries 0 and renders as "~0 min", which reads ` +
        `as instant delivery.`
    );
  }
});

test("zero is treated as absent, not as a number to print", () => {
  /* The specific shape: 0 must reach a branch that says something other than a
     time. */
  const src = rendered("components/shop/pincode-check.tsx");
  assert.match(
    src,
    /etaMinutes\s*>\s*0/,
    "pincode-check no longer distinguishes a zero ETA from a real one"
  );
  assert.match(
    src,
    /We deliver here/,
    "there is no wording for a serviceable pincode with no time promise"
  );
});
