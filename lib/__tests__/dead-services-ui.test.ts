import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The unreachable services booking UI must stay unreachable, or lose its
 * promises on the way back.
 *
 * Eight components form a complete booking flow that no route renders:
 * `components/sections/services/*`, `components/service-card.tsx` and
 * `components/services/booking-modal.tsx`. `/services` imports none of them —
 * it renders its own copy and links to verticalconstruction.in.
 *
 * They still carry commitments the live page was corrected to stop making
 * (f7d1280): a free site visit, a free consultation, a callback within 24
 * hours. Those are operational commitments — somebody's time, promised — and
 * none is agreed. None of it reaches a customer today, and all of it ships the
 * moment somebody wires one import, at which point it would contradict the page
 * beside it.
 *
 * ISS-067 leaves two coherent outcomes, both the owner's: retire the flow with
 * the rest of the services split, or revive it and give the copy the same
 * treatment /services got. Rewriting the copy of dead code is neither, so this
 * does not do that.
 *
 * It is a tripwire. While the components are unreachable it asserts only that
 * they are still unreachable. The moment one is imported by a route it demands
 * the promises be gone first — so the accident this issue describes cannot
 * happen quietly, and the decision stays the owner's.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The dead flow, from the issue. */
const DEAD = [
  "components/services/booking-modal.tsx",
  "components/service-card.tsx",
  "components/sections/services/service-categories.tsx",
  "components/sections/services/services-hero.tsx",
  "components/sections/services/why-choose.tsx",
  "components/sections/services/how-it-works.tsx",
  "components/sections/services/featured-services.tsx",
  "components/sections/services/services-cta.tsx",
];

/** Commitments nobody has agreed to, in the words they are written in. */
const PROMISES: [string, RegExp][] = [
  ["a free site visit", /site visits? (and [^.]*)?(are|is) free|free site visit/i],
  ["a free consultation", /free consultation/i],
  ["a callback within 24 hours", /within 24 hours/i],
  ["quality checked at every stage", /quality checked at every stage/i],
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Everything under app/ — the only place a route can live. */
const ROUTE_FILES = walk(join(ROOT, "app")).map((f) => relative(ROOT, f));

/** Files that exist, of the flow. A deleted one is retired, which is outcome 1. */
const PRESENT = DEAD.filter((rel) => {
  try {
    statSync(join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
});

/**
 * Everything reachable from a route, followed transitively.
 *
 * The first version of this asked "is anything importing you", which flagged
 * `service-card -> booking-modal` — two dead components importing each other
 * inside the dead flow. That is not reachability; it is the flow being
 * internally consistent while nothing enters it. What matters is whether a
 * request can arrive at one of these, and only `app/` can start that.
 */
const REACHABLE: Set<string> = (() => {
  const seen = new Set<string>();
  const queue = [...ROUTE_FILES];

  /* "@/components/x/y" or "@/lib/x" -> repo-relative file, whichever extension
     is on disk. */
  const resolve = (spec: string): string | null => {
    const base = spec.replace(/^@\//, "");
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      try {
        statSync(join(ROOT, base + ext));
        return base + ext;
      } catch {
        /* try the next extension */
      }
    }
    return null;
  };

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    let src: string;
    try {
      src = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    for (const m of src.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
      const next = resolve(m[1]);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
})();

/** Which routes or components pull this one in — reported only when it is
 *  actually reachable, so the message names something worth opening. */
function importersOf(rel: string): string[] {
  if (!REACHABLE.has(rel)) return [];
  const spec = rel.replace(/\.tsx?$/, "");
  const needle = new RegExp(`from\\s+["']@/${spec.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}["']`);
  return [...REACHABLE].filter(
    (f) => f !== rel && needle.test(readFileSync(join(ROOT, f), "utf8"))
  );
}

test("the services flow is still being tracked", () => {
  /* Non-vacuity: if every file is deleted this passes by inspecting nothing,
     and that is the correct outcome — but it should be a deliberate one, so it
     says so rather than going quiet. */
  if (PRESENT.length === 0) {
    assert.ok(true, "the services booking flow has been retired — ISS-067 outcome 1");
    return;
  }
  assert.ok(ROUTE_FILES.length > 20, `only ${ROUTE_FILES.length} route files found`);
});

test("no route reaches the services booking flow while it still promises a free visit", () => {
  for (const rel of PRESENT) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const carried = PROMISES.filter(([, re]) => re.test(src)).map(([what]) => what);
    if (carried.length === 0) continue; // copy already corrected — safe to wire

    const importers = importersOf(rel);
    assert.deepEqual(
      importers,
      [],
      `${rel} promises ${carried.join(" and ")}, and is now imported by ` +
        `${importers.join(", ")}. Either remove the commitment or retire the ` +
        `component — ISS-067. A free site visit and a 24-hour callback are ` +
        `somebody's time, and neither has been agreed.`
    );
  }
});

test("the booking write path is not revived without a safe booking number", () => {
  /* `createBooking` numbers with `count() + 1`. Two concurrent bookings resolve
     to the same number and `bookingNo` is unique, so the second crashes rather
     than corrupting — tolerable while nothing can call it, not once something
     can. */
  const service = readFileSync(join(ROOT, "lib/services/bookings.ts"), "utf8");
  if (!/count\(\)\s*\)?\s*\+\s*1/.test(service)) return; // already fixed

  const modal = "components/services/booking-modal.tsx";
  if (!PRESENT.includes(modal)) return;

  assert.deepEqual(
    importersOf(modal),
    [],
    "the booking modal is reachable while createBooking still numbers bookings " +
      "with count() + 1, which two concurrent bookings resolve identically"
  );
});
