import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The home banner caused horizontal scroll from 768px to ~1060px (staging
 * sweep, 12 Oct 2026): `aspect-ratio` with `min-height` and an auto width
 * transfers the minimum height into a minimum width (380 × 1200/440 ≈ 1036px).
 * A definite width keeps min-height from widening the box.
 */
test("the hero window has a definite width, so min-height cannot widen it", () => {
  const css = readFileSync(new URL("../../app/home-merchandising.css", import.meta.url), "utf8");
  const rule = css.slice(css.indexOf(".ve-hero-window {"), css.indexOf("}", css.indexOf(".ve-hero-window {")));
  assert.match(rule, /min-height:\s*380px/, "the rule under test moved");
  assert.match(rule, /width:\s*100%/);
  assert.match(rule, /min-width:\s*0/);
});
