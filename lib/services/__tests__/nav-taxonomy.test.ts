import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY_GROUPS, TOTAL_CATEGORIES } from "@/components/ui/product-panel";
import { db } from "@/lib/db";

/**
 * Every category in the navigation must exist, and every category must be
 * reachable.
 *
 * The nav offered 21 categories against 20 in the database, and the difference
 * was not an off-by-one:
 *
 *   "appliances-power-backup" was a slug typo for the real
 *   "home-appliances-power-backup" — /category/appliances-power-backup
 *   rendered a 404.
 *
 *   "Power Tools & Accessories" had no category behind it in any environment.
 *   Also a 404.
 *
 *   And "home-appliances-power-backup", which does exist and has products,
 *   was reachable from no menu at all.
 *
 * A category in the main navigation that dead-ends is worse than one that is
 * missing: somebody clicks it looking for an inverter and concludes the shop is
 * broken. This pairs the taxonomy to the data so neither can drift.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const navSlugs = CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => c.slug));

test("the taxonomy is non-trivial", () => {
  /* Non-vacuity: an empty CATEGORY_GROUPS would satisfy every check below. */
  assert.ok(navSlugs.length > 15, `only ${navSlugs.length} categories in the nav`);
  assert.equal(TOTAL_CATEGORIES, navSlugs.length, "the count and the list disagree");
});

/**
 * Every component that hardcodes a category link, found rather than listed.
 *
 * The two dead slugs above were removed from the nav in 9386b36 and survived in
 * `categories-switcher.tsx` — the category index itself — because this file
 * checked only `CATEGORY_GROUPS`. Both tiles rendered a 404 page, confirmed in
 * the browser. `mobile-category-row.tsx` held two more ("adhesives", "tools")
 * and was deleted: it was exported and imported by nothing.
 *
 * So the sweep is not a list. A component that links to /category/<slug> and
 * writes that slug as a literal is checked, wherever it is added.
 */
function componentsLinkingToCategories(): { rel: string; slugs: string[] }[] {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (name.endsWith(".tsx")) out.push(full);
    }
    return out;
  };

  return [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))]
    .map((abs) => {
      const src = readFileSync(abs, "utf8");
      if (!src.includes("/category/")) return null;
      const slugs = [...src.matchAll(/\bslug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
      return slugs.length ? { rel: relative(ROOT, abs), slugs } : null;
    })
    .filter((x): x is { rel: string; slugs: string[] } => x !== null);
}

test("every hardcoded category link resolves to a real category", async () => {
  const files = componentsLinkingToCategories();

  /* Non-vacuity: if the sweep stops finding files, this passes on nothing —
     which is precisely how the two dead slugs survived the first fix. */
  assert.ok(
    files.length >= 2,
    `only ${files.length} components found that hardcode a category slug`
  );

  const rows = await db.category.findMany({ select: { slug: true } });
  const dbSlugs = new Set(rows.map((c) => c.slug));

  const dead = files.flatMap(({ rel, slugs }) =>
    slugs.filter((s) => !dbSlugs.has(s)).map((s) => `${rel} -> /category/${s}`)
  );
  assert.deepEqual(dead, [], `these links render a 404:\n  ${dead.join("\n  ")}`);
});

test("the category index lists every category that exists", async () => {
  /* The other direction, on the page whose only job is to list them.
     `home-appliances-power-backup` holds two published products and was absent
     from /categories: the slug typo that 404'd in its place was corrected in
     the navigation, and the index was never looked at. Unreachable stock is
     invisible stock. */
  const index = componentsLinkingToCategories().find((f) =>
    f.rel.endsWith("categories-switcher.tsx")
  );
  assert.ok(index, "the category index no longer hardcodes its category list");

  const rows = await db.category.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  const listed = new Set(index.slugs);
  const missing = rows.map((c) => c.slug).filter((s) => !listed.has(s));

  assert.deepEqual(
    missing,
    [],
    `these categories exist but are not on /categories: ${missing.join(", ")}`
  );
});

test("every navigation category exists in the database", async () => {
  const rows = await db.category.findMany({ select: { slug: true } });
  const dbSlugs = new Set(rows.map((c) => c.slug));

  const dead = navSlugs.filter((s) => !dbSlugs.has(s));
  assert.deepEqual(
    dead,
    [],
    `These categories are offered in the navigation and 404 when clicked: ${dead.join(", ")}`
  );
});

test("every database category is reachable from the navigation", async () => {
  /* The other direction, and the one that hides: a category with products that
     no menu links to is stock nobody can find. */
  const rows = await db.category.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  const navSet = new Set(navSlugs);

  const orphaned = rows.map((c) => c.slug).filter((s) => !navSet.has(s));
  assert.deepEqual(
    orphaned,
    [],
    `These categories exist and are active but appear in no menu: ${orphaned.join(", ")}`
  );
});

test("no category count is hardcoded in the copy", () => {
  /* It was written out as "21" in seven places and every one of them was
     wrong. TOTAL_CATEGORIES is derived from the taxonomy, so it cannot drift
     from what the menus actually list. */
  const files = [
    "components/sections/navbar.tsx",
    "components/sections/footer.tsx",
    "components/sections/categories.tsx",
    "components/mobile/home/mobile-home-view.tsx",
    "components/mobile/categories/categories-switcher.tsx",
  ];
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.ok(
      !/\b\d{2}\s+categories\b/i.test(src),
      `${rel} hardcodes a category count; use TOTAL_CATEGORIES`
    );
  }
});
