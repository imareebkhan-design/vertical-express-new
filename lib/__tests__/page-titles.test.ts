import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A page title must not repeat the brand the layout already appends.
 *
 * `app/layout.tsx` sets `title.template = "%s | Vertical Express"`, so Next.js
 * appends the brand to whatever a page supplies. Twenty-seven pages supplied it
 * themselves as well, and every one rendered doubled:
 *
 *   "Sign in | Vertical Express | Vertical Express"
 *   "Terms of service | Vertical Express | Vertical Express"
 *   "All Categories | Vertical Express | Vertical Express"
 *
 * The title is the browser tab, the bookmark, the text of a shared link and the
 * blue line of a Google result — every page on the site except the home page,
 * which supplies no title of its own and so escaped it.
 *
 * Verified in the browser before and after on /login, /terms and /categories.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BRAND = "Vertical Express";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Every `title: "…"` in app/, with the file it came from. */
const TITLES: { rel: string; title: string }[] = walk(join(ROOT, "app")).flatMap((abs) => {
  const rel = relative(ROOT, abs);
  return [...readFileSync(abs, "utf8").matchAll(/title:\s*"([^"]*)"/g)].map((m) => ({
    rel,
    title: m[1],
  }));
});

test("page titles are still being found", () => {
  /* Non-vacuity: if the walk breaks or metadata moves, the assertion below
     passes by inspecting nothing. */
  assert.ok(TITLES.length >= 25, `only ${TITLES.length} titles found under app/`);
  assert.ok(
    TITLES.some((t) => t.rel === "app/layout.tsx"),
    "the root layout's metadata is no longer being read"
  );
});

test("the layout still appends the brand", () => {
  /* The whole reason a page must not: remove the template and every page loses
     the brand instead of doubling it, and these assertions would be wrong. */
  const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
  assert.match(
    layout,
    /template:\s*"%s \| Vertical Express"/,
    "the title template has changed; page titles must supply the brand again"
  );
});

test("no page title repeats the brand the template adds", () => {
  /* Open Graph and Twitter titles in the layout are absolute — they are not run
     through the template, so they legitimately carry the brand. */
  for (const { rel, title } of TITLES) {
    if (rel === "app/layout.tsx") continue;
    assert.ok(
      !title.includes(BRAND),
      `${rel} sets the title "${title}", which renders as "${title} | ${BRAND}"`
    );
  }
});
