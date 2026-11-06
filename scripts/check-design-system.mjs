#!/usr/bin/env node
/**
 * Design-system guard.
 *
 * The August token migration moved everything that was *named* — utility
 * classes resolved through the alias layer in globals.css. It could not reach
 * two places, and both were still shipping retired brand colours months later:
 *
 *   1. Arbitrary values. Deep navy #0F2138 survived as rgba(15,33,56,…) in a
 *      nav shadow; gold #FCBD00 survived as rgba(252,189,0,…) in three CTA
 *      shadows. A class-name check sees neither.
 *   2. Raster assets. A hero banner carried "60 minutes" baked in as pixels.
 *      Nothing static can catch that — it is listed here as a reminder only.
 *
 * So this checks the values, not just the class names.
 */
import { readFileSync } from "node:fs";

import { execSync } from "node:child_process";

const FILES = execSync(
  `find app components lib -type f \\( -name '*.tsx' -o -name '*.ts' \\)`,
  { encoding: "utf8" }
).trim().split("\n").filter(Boolean);

/** Retired palettes. These must never reappear in any form. */
const RETIRED = [
  { re: /#0F2138|rgba?\(\s*15\s*,\s*33\s*,\s*56/i, what: "deep navy #0F2138 (Architectural Lifestyle, retired)" },
  { re: /#FCBD00|rgba?\(\s*252\s*,\s*189\s*,\s*0/i, what: "gold #FCBD00 (Architectural Lifestyle, retired)" },
];

/**
 * Green and red on a customer surface.
 *
 * The app system board is unambiguous: "No green anywhere — it is HomeRun's
 * tell and it would be a fourth colour system. No red either: urgency is
 * carried by amber-soft, absence by grey."
 *
 * This checks raw Tailwind palette classes rather than tokens, because that is
 * how it got in. `--color-success` is aliased to ink, so `text-success` is
 * already compliant and passes the alias layer honestly; `text-emerald-600`
 * routes around the tokens entirely and renders actual green. Twelve of those
 * had accumulated across the mobile checkout, wallet, confirmation and order
 * screens, and none of them tripped a single existing check.
 *
 * The ops console is exempt: it has its own five-colour status palette
 * (--color-ops-*) precisely because a dispatcher needs red to mean stop.
 */
const BANNED_HUES = /\b(?:bg|text|border|ring|from|to|via)-(emerald|green|lime|teal|red|rose|pink)-\d{2,3}\b/;
const OPS_SURFACES = ["components/admin/", "app/admin/", "components/ops/"];

/** Any hex outside the token file, minus the ones a design system legitimately inlines. */
const HEX = /#[0-9A-Fa-f]{6}\b/g;
/** Values that are correct but must be literal (third-party SDK theme hooks). */
const ALLOWED_HEX_VALUES = new Set(["#EDAF1C", "#111111", "#F3F2F0"]);
const ALLOWED_HEX_FILES = [
  "components/auth/login-hero.tsx",      // inline styles in a canvas scene; values are system tokens
  "components/auth/sign-in-form.tsx",    // Google's brand mark — its colours are fixed by Google, not by us
  "components/admin/bi/charts.tsx",      // chart series need literal hex, not CSS vars
  "app/global-error.tsx",                // replaces the root layout; cannot use Tailwind
  "lib/services/email.ts",               // HTML email; no stylesheet, inline hex is the only option
];

let errors = 0;
const warn = [];

for (const file of FILES) {
  const src = readFileSync(file, "utf8");

  for (const { re, what } of RETIRED) {
    if (re.test(src)) {
      console.error(`ERROR  ${file}\n       contains ${what}`);
      errors++;
    }
  }

  if (!OPS_SURFACES.some((o) => file.includes(o))) {
    const hue = src.match(BANNED_HUES);
    if (hue) {
      console.error(
        `ERROR  ${file}\n       uses ${hue[0]} — no green or red on a customer surface.` +
          `\n       Urgency is amber-soft, absence is grey, success is ink (--color-success).`
      );
      errors++;
    }
  }

  if (!ALLOWED_HEX_FILES.some((a) => file.endsWith(a))) {
    const found = [...new Set(src.match(HEX) || [])].filter((h) => !ALLOWED_HEX_VALUES.has(h.toUpperCase()));
    if (found.length) warn.push(`WARN   ${file}\n       hardcoded hex ${found.join(", ")} — prefer a token`);
  }
}

if (warn.length) console.log(warn.join("\n"));

if (errors) {
  console.error(`\n✗ ${errors} palette violation(s) — retired brand colours, or green/red on a customer surface.`);
  process.exit(1);
}
console.log(`✓ design system: no retired palette values in ${FILES.length} files` + (warn.length ? `, ${warn.length} hex warning(s)` : ""));
