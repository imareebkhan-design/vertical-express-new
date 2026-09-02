import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
