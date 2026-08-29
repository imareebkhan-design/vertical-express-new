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
import { globSync } from "node:fs";
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

/** Any hex outside the token file, minus the ones a design system legitimately inlines. */
const HEX = /#[0-9A-Fa-f]{6}\b/g;
/** Values that are correct but must be literal (third-party SDK theme hooks). */
const ALLOWED_HEX_VALUES = new Set(["#EDAF1C", "#111111", "#F3F2F0"]);
const ALLOWED_HEX_FILES = [
  "components/auth/login-hero.tsx",      // inline styles in a canvas scene; values are system tokens
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

  if (!ALLOWED_HEX_FILES.some((a) => file.endsWith(a))) {
    const found = [...new Set(src.match(HEX) || [])].filter((h) => !ALLOWED_HEX_VALUES.has(h.toUpperCase()));
    if (found.length) warn.push(`WARN   ${file}\n       hardcoded hex ${found.join(", ")} — prefer a token`);
  }
}

if (warn.length) console.log(warn.join("\n"));

if (errors) {
  console.error(`\n✗ ${errors} retired-palette violation(s). These are colours the token migration deleted.`);
  process.exit(1);
}
console.log(`✓ design system: no retired palette values in ${FILES.length} files` + (warn.length ? `, ${warn.length} hex warning(s)` : ""));
