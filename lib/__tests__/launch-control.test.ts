import test from "node:test";
import assert from "node:assert/strict";
import { PRIMARY_GROUPS } from "@/lib/category-directory";
import { buildLaunchTree, CATEGORY_STATE_LABEL, CATEGORY_STATE_NOTE, type LaunchCategoryRow } from "@/lib/launch-control";

/**
 * Launch Control's category states are the category directory's, read back.
 * These pin each state to the storefront behaviour it reports.
 */

const CURATED = PRIMARY_GROUPS.flatMap((g) => g.categories.map((c) => ({ slug: c.slug, group: g.key })));
const row = (slug: string, over: Partial<LaunchCategoryRow> = {}): LaunchCategoryRow => ({
  slug, name: `db:${slug}`, group: CURATED.find((c) => c.slug === slug)?.group ?? "tools",
  isActive: true, visible: 0, byStatus: {}, hasTaxMapping: true, ...over,
});
const allCurated = (over: (slug: string) => Partial<LaunchCategoryRow> = () => ({})) => CURATED.map((c) => row(c.slug, over(c.slug)));
const find = (tree: ReturnType<typeof buildLaunchTree>, slug: string) => tree.flatMap((d) => d.categories).find((c) => c.slug === slug);

test("each state means what the storefront does", () => {
  const tree = buildLaunchTree([
    ...allCurated((s) => s === "cement" ? { visible: 3, byStatus: { published: 3, draft: 1 } } : s === "tiling" ? { isActive: false, byStatus: { published: 5 } } : {}),
    row("power-tools", { visible: 2 }),
    row("spare-parts"),
  ]);
  assert.equal(find(tree, "cement")?.state, "shown");
  assert.equal(find(tree, "cement")?.total, 4);
  assert.equal(find(tree, "painting")?.state, "coming_soon", "a designated category with nothing visible");
  assert.equal(find(tree, "tiling")?.state, "hidden");
  assert.equal(find(tree, "power-tools")?.state, "shown", "a stocked non-designated category is listed");
  assert.equal(find(tree, "spare-parts")?.state, "not_listed", "an empty non-designated category is left out");
});

test("a designated category the database lacks is reported, never invented", () => {
  const tree = buildLaunchTree(allCurated().filter((r) => r.slug !== "lighting"));
  const lighting = find(tree, "lighting");
  assert.equal(lighting?.state, "missing");
  assert.equal(lighting?.total, 0);
});

test("departments follow the shop's order and names; reachable counts shown and coming soon", () => {
  const tree = buildLaunchTree(allCurated((s) => s === "cement" ? { visible: 1 } : s === "tiling" ? { isActive: false } : {}));
  assert.deepEqual(tree.map((d) => d.title), PRIMARY_GROUPS.map((g) => g.title));
  assert.equal(tree[0].categories[0].name, "Cement", "the curated display name, not the database name");
  assert.equal(tree[0].reachable, tree[0].categories.length - 1);
  assert.ok(tree.every((d) => d.curated), "no secondary group when every category is designated");
});

test("cement and aggregates launch: aggregates is not yet a designated category (owner decision D1)", () => {
  const tree = buildLaunchTree([
    ...allCurated((s) => s === "cement" ? { visible: 4 } : { isActive: false }),
    row("aggregates", { visible: 2, hasTaxMapping: false }),
  ]);
  assert.deepEqual(tree.filter((d) => d.reachable > 0).map((d) => [d.key, d.reachable]), [["civil_interiors", 1], ["tools_equipment", 1]]);
  const aggregates = find(tree, "aggregates");
  assert.equal(aggregates?.state, "shown");
  assert.equal(aggregates?.hasTaxMapping, false);
  // It lands in the secondary group, which customers see as "Tools & Equipment".
  assert.equal(tree.find((d) => d.categories.some((c) => c.slug === "aggregates"))?.curated, false);
});

test("every state has a label and an operator note", () => {
  for (const s of ["shown", "coming_soon", "not_listed", "hidden", "missing"] as const) {
    assert.ok(CATEGORY_STATE_LABEL[s]);
    assert.ok(CATEGORY_STATE_NOTE[s]);
  }
});
