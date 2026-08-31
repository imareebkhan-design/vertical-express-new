import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Standing commitments the business has not agreed to.
 *
 * A "5% cashback on every delivered order" line had spread across six files —
 * an onboarding card, two wallet views, a notification body, a page
 * description and a transaction label. No cashback policy exists. Anyone who
 * read it and did not receive it would have been right to complain, and because
 * it was scattered, removing it from the screen you happened to be looking at
 * fixed one sixth of the problem.
 *
 * That is the failure mode this guards: not one wrong sentence, but the same
 * invented promise reproduced until it looks like policy. A rate, a window or a
 * ceiling is a commitment; it belongs to the owner, and until they set one the
 * honest options are the placeholder marker or silence.
 *
 * NOT covered here: the 60-minute delivery claim. It is real and open
 * (ISS-054), it arrives through a default parameter rather than copy, and it
 * needs the owner's answer rather than a test.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SEARCH = ["app", "components", "lib"];

const BANNED: { re: RegExp; what: string }[] = [
  { re: /\b\d+\s*%\s*cashback/i, what: "a cashback rate — no cashback policy exists" },
  { re: /cashback\s+(of\s+)?\d+\s*%/i, what: "a cashback rate — no cashback policy exists" },
  { re: /\bvalid for \d+ days\b/i, what: "a wallet expiry window — none has been agreed" },
  { re: /\bauthoris?ed (dealer|distributor|reseller)\b/i, what: "an authorised-brand claim — none is held" },
  { re: /\bno minimum order\b/i, what: "a no-minimum-order promise — unconfirmed" },
  { re: /\blowest price(s)? guaranteed\b/i, what: "a price guarantee — unconfirmed" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/__tests__|\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Comments explain why a claim was removed; only shipped strings count. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

test("no unconfirmed business commitment is stated as fact", () => {
  const offenders: string[] = [];
  let scanned = 0;

  for (const base of SEARCH) {
    for (const file of walk(join(ROOT, base))) {
      scanned += 1;
      const src = code(readFileSync(file, "utf8"));
      for (const { re, what } of BANNED) {
        const hit = src.match(re);
        if (hit) offenders.push(`${relative(ROOT, file)} states ${what} — "${hit[0].trim()}"`);
      }
    }
  }

  assert.ok(scanned > 100, `expected to scan the source tree, saw only ${scanned} files`);
  assert.deepEqual(
    offenders,
    [],
    "These state a commitment nobody has agreed to. Use PlaceholderValue, or say nothing, " +
      "until the owner sets the figure.\n  - " + offenders.join("\n  - ")
  );
});
