import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMinutes } from "@/lib/services/settings";

/**
 * On-time performance is measured against a target somebody chose.
 *
 * ISS-064. `bi.ts` carried `const packingSlaLimit = 120` and
 * `const deliverySlaLimit = 240` — two minute-counts an engineer picked — and
 * the console reported compliance against them as a percentage on a card
 * labelled "Delivery SLA Pass". Nobody had agreed to four hours. The owner has
 * not confirmed *any* delivery time; the express window in CLAUDE.md is
 * explicitly listed as unverified.
 *
 * The second half was worse and quieter: an empty denominator returned 100. A
 * week with no deliveries reported perfect delivery, and a quiet January in
 * Srinagar is exactly when that would have been read.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BI = readFileSync(join(ROOT, "lib/services/admin/bi.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

test("the SLA targets come from settings, not from the source", () => {
  assert.ok(
    BI.includes("SETTING_KEYS.packSlaMinutes") && BI.includes("SETTING_KEYS.deliverySlaMinutes"),
    "bi.ts no longer reads the SLA targets from settings"
  );
  for (const literal of [/SlaLimit\s*=\s*\d/, /Sla[A-Za-z]*\s*=\s*\d{2,}/]) {
    assert.ok(
      !literal.test(BI),
      "an SLA limit is assigned a number literal in bi.ts. The target is the " +
        "owner's to set — a figure here is reported to a dispatcher as fact."
    );
  }
});

test("an unset target is not a passing grade", () => {
  /* The shape that matters: null, never a number. `?? 0` would be as wrong as
     `: 100` — it would read as total failure instead of total success, and
     both are claims about performance nobody measured. */
  assert.equal(parseMinutes(null), null);
  assert.equal(parseMinutes(""), null);
  assert.equal(parseMinutes("   "), null);
});

test("a malformed target is not silently rounded into one", () => {
  for (const bad of ["0", "-30", "12.5", "soon", "1e3ms", "NaN", "Infinity"]) {
    assert.equal(parseMinutes(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("a real target parses", () => {
  assert.equal(parseMinutes("120"), 120);
  assert.equal(parseMinutes(" 45 "), 45);
});

test("an empty period cannot report a percentage", () => {
  /* Asserted on the source because the alternative needs a database with
     orders in a period and none in another, and the defect is a single
     ternary. Both percentages must be gated on the count being non-zero AND
     the target being set. */
  assert.ok(
    /packingSlaLimit !== null && fulfillCount > 0/.test(BI),
    "the packing percentage is not gated on both a target and a denominator"
  );
  assert.ok(
    /deliverySlaLimit !== null && deliveryCount > 0/.test(BI),
    "the delivery percentage is not gated on both a target and a denominator"
  );
  assert.ok(
    !/:\s*100;/.test(BI),
    "a fallback of 100 remains — zero deliveries is not perfect delivery"
  );
});

test("the marketing funnel is not derived from a made-up ratio", () => {
  /* ISS-065, the same defect in a different costume. Checkout dropoff was
     `orderCount * 0.15`, which made the conversion rate a constant ~87% that
     no amount of real trading could move — and the five "top searches" beside
     it were a hardcoded list. A term with a count next to it is a demand
     signal, and somebody buys stock against those. */
  assert.ok(
    !/orderCount\s*\*\s*0\./.test(BI),
    "a checkout figure is derived from a made-up ratio of the order count"
  );
  for (const invented of ["tmt bars", "solar tiles", "excavator lease", "wooden logs"]) {
    assert.ok(
      !BI.includes(invented),
      `"${invented}" is a fabricated search term still in bi.ts`
    );
  }
});
