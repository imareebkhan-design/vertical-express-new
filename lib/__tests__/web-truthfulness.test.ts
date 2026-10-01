import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Claims the customer-facing web must not make.
 *
 * Each pattern below was live on the storefront and was removed in Web
 * Completion Batch 1 (docs/WEB_APP_AUDIT.md): a placeholder support number, a
 * 60-minute SLA nobody has confirmed, delivery slots that do not exist, an
 * order-level minute ETA shown for truck shipments, a hardcoded default
 * pincode, a credit facility that does not exist, and a single GST rate
 * printed over mixed-rate orders. They crept back in through copy more than
 * through logic, so this reads the source.
 *
 * Comments are stripped first — many of these files explain in a comment the
 * exact phrase that was removed, and that is where the explanation belongs.
 */

const ROOT = join(__dirname, "..", "..");
/* Customer-facing copy also lives in the policy pages' content and the order
   email, which is why two files outside app/ and components/ are read too. */
const SCAN = ["app", "components", "lib/content.ts", "lib/services/email.ts"];
const SKIP = [/^app\/admin\//, /^app\/api\//, /^components\/admin\//, /__tests__\//, /\.test\.tsx?$/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mdx?)$/.test(name) ? [p] : [];
  });
}

function withoutComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /tel:\+?91\s?98765\s?43210/, why: "design-canvas example phone number used as a real contact" },
  { pattern: /\b(in|within) (an|the) hour\b/i, why: "60-minute SLA is unconfirmed (owner decision)" },
  { pattern: /60-minute delivery/i, why: "60-minute SLA is unconfirmed (owner decision)" },
  { pattern: /slot you (pick|choose)|you pick the slot|two slots|Slot for each shipment|two arrival times/i, why: "delivery slots / arrival times do not exist (no Slot model)" },
  { pattern: /Estimated delivery in ~|Delivering in ~|ETA ~\$\{|ETA \$\{/, why: "order-level minute ETA — use lib/order-display so truck shipments state no time" },
  { pattern: /~\$\{[^}`]*etaMinutes/, why: "raw minute ETA template — use lib/order-display so truck shipments state no time" },
  { pattern: /defaultPincode=["']\d{6}["']/, why: "hardcoded default pincode presented as the customer's location" },
  { pattern: /expanding soon/i, why: "expansion promise nobody has made" },
  { pattern: /Pay on delivery available/i, why: "COD is switched off business-wide; only checkout knows whether it is offered" },
  { pattern: /Wallet (&amp;|&|and) credit/i, why: "Vertical Credit does not exist" },
  { pattern: /GST \(18%/, why: "single GST rate printed over mixed-rate orders (cement is 28%)" },
  { pattern: /GST \(\{[^}]*ratePct/, why: "blended GST rate printed over mixed-rate carts is no item's rate" },
  { pattern: /GST (and|&) delivery calculated at checkout/i, why: "prices already include GST; checkout adds none" },
  /* Web Completion Batch 2 — location correctness. */
  { pattern: /pincode\s*[:=]\s*["']1[89]\d{4}["']|useState\(["']1[89]\d{4}["']\)/, why: "hardcoded pincode as a form or location default — a customer could save a site they never typed (W-13, W-26)" },
  { pattern: /1[89]\d{4}\s*[-–]\s*1[89]\d{4}/, why: "hardcoded serviceable range; ServiceablePincode is the only list (W-22)" },
  { pattern: /instant delivery/i, why: "speed promise nobody has confirmed (O-06)" },
  /* Closure loop, 27 Sep 2026 — each was live and removed. */
  { pattern: /94190\s?12345|Rajbagh Industrial Zone/, why: "invented support phone / warehouse location (owner items 1.3, 1.4)" },
  { pattern: /Native Shell v\d/, why: "invented app version string" },
  { pattern: /Credit has been added to your wallet/i, why: "states a cashback credit the order may not have earned" },
  { pattern: /valid 1–30 Sep|Updated monthly|Every price document is dated/i, why: "price lists are not published; no validity window or cadence exists" },
  { pattern: /saved list in two taps|scan a batch code/i, why: "app features that do not exist (no saved lists, no batch scanning)" },
  { pattern: /Notify me/, why: "a notify request that nothing records" },
  { pattern: /photographed before loading|We photograph bags|Batch verified/i, why: "no dispatch photo or batch record exists" },
  { pattern: /You're on the list|You’re on the list/, why: "newsletter success with no mailing list behind it" },
  { pattern: /Dark Mode \(Beta\)|label: "Popularity"/, why: "a control that does nothing / a ranking backed by an empty column" },
  { pattern: /with live tracking/i, why: "live tracking is not available" },
  { pattern: /(available|disabled) for this (delivery )?pincode|for this delivery zone/i, why: "COD refusal blamed on the pincode when the business-wide switch may be the cause" },
];

/* Known and recorded, not yet fixed — each names where it is tracked. Listed
   here rather than skipped so the scan fails the day the file changes shape. */
const KNOWN: { file: string; match: string; tracked: string }[] = [
  {
    file: "app/(account)/account/orders/[orderNo]/invoice/page.tsx",
    match: "GST ({gst.ratePct",
    tracked: "docs/WEB_APP_AUDIT.md — invoice rate labels, P2 (needs a per-rate tax breakdown)",
  },
  {
    file: "components/mobile/home/mobile-header.tsx",
    match: 'pincode = "190001"',
    tracked: "docs/WEB_APP_AUDIT.md — Batch 2: MobileHeader has no importers (dead code), P3",
  },
];

test("customer-facing web source makes none of the removed false claims", () => {
  const files = SCAN.flatMap((d) => (statSync(join(ROOT, d)).isDirectory() ? walk(join(ROOT, d)) : [join(ROOT, d)]))
    .map((f) => relative(ROOT, f))
    .filter((rel) => !SKIP.some((re) => re.test(rel)));
  assert.ok(files.length > 50, `only ${files.length} files scanned — the walk is broken`);

  const hits: string[] = [];
  for (const rel of files) {
    const code = withoutComments(readFileSync(join(ROOT, rel), "utf8"));
    for (const { pattern, why } of BANNED) {
      const m = code.match(pattern);
      if (m && !KNOWN.some((k) => k.file === rel && k.match === m[0])) hits.push(`${rel}: "${m[0]}" — ${why}`);
    }
  }
  assert.deepEqual(hits, [], `False claims found:\n${hits.join("\n")}`);
  for (const k of KNOWN) {
    const code = withoutComments(readFileSync(join(ROOT, k.file), "utf8"));
    assert.ok(code.includes(k.match), `${k.file} no longer contains "${k.match}" — remove it from KNOWN (${k.tracked})`);
  }
});

test("the scanner still catches a claim when it is not in a comment", () => {
  const live = withoutComments(`const x = <p>Small items in an hour</p>; // in an hour`);
  assert.match(live, /in an hour/);
  const commented = withoutComments(`{/* Was "small items in an hour" */}\n/* in an hour */`);
  assert.doesNotMatch(commented, /in an hour/);
});
