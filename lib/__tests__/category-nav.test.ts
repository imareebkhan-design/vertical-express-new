import test from "node:test";
import assert from "node:assert/strict";
import { buildCategoryDirectory, PRIMARY_GROUPS } from "@/lib/category-directory";
import { buildCategoryNav } from "@/lib/category-nav";

/**
 * ISS-102: the navbar, footer and helper links listed fixed category slugs, so
 * switching a category off left links to a 404. They now come from the
 * directory; these tests pin that no hidden category can be linked.
 */

const ALL = PRIMARY_GROUPS.flatMap((g) => g.categories.map((c) => ({ slug: c.slug, group: g.key })));
const rows = (active: (slug: string) => boolean, extra: { slug: string; count: number }[] = []) => [
  ...ALL.map(({ slug, group }) => ({ slug, name: `db:${slug}`, group, isActive: active(slug), _count: { products: 1 } })),
  ...extra.map(({ slug, count }) => ({ slug, name: `db:${slug}`, group: "tools", isActive: true, _count: { products: count } })),
];
const linked = (nav: ReturnType<typeof buildCategoryNav>) =>
  nav.departments.flatMap((d) => [d.href, ...d.items.map((i) => i.href)]);

test("everything shown: four departments as the navbar always had them, landing pages unchanged", () => {
  const nav = buildCategoryNav(buildCategoryDirectory(rows(() => true)));
  assert.deepEqual(nav.departments.map((d) => [d.label, d.href]), [
    ["Civil & Interiors", "/category/cement"],
    ["Furniture & Hardware", "/category/general-hardware-tools"],
    ["Electrical", "/category/wires-mcb-distribution-boards"],
    ["Plumbing & Bath", "/category/cpvc-pipes-overhead-tanks"],
  ]);
  assert.equal(nav.departments[0].items[0].label, "Cement");
  assert.equal(nav.slugs.length, ALL.length);
});

test("a hidden category is never linked, as an item or as a department's landing", () => {
  const hidden = new Set(["tiling", "general-hardware-tools", "lighting"]);
  const nav = buildCategoryNav(buildCategoryDirectory(rows((s) => !hidden.has(s))));
  for (const href of linked(nav)) assert.ok(![...hidden].some((s) => href === `/category/${s}`), `${href} is hidden`);
  for (const s of hidden) assert.ok(!nav.slugs.includes(s));
  // The department link falls back to its first shown category.
  assert.equal(nav.departments.find((d) => d.key === "furniture_hardware")?.href, "/category/hinges-channels-handles");
});

test("a department with nothing shown disappears", () => {
  const nav = buildCategoryNav(buildCategoryDirectory(rows((s) => !ALL.some((a) => a.slug === s && a.group === "electrical"))));
  assert.deepEqual(nav.departments.map((d) => d.key), ["civil_interiors", "furniture_hardware", "plumbing_bath"]);
});

test("cement-only launch: one department, one link", () => {
  const nav = buildCategoryNav(buildCategoryDirectory(rows((s) => s === "cement")));
  assert.deepEqual(nav.departments, [{
    key: "civil_interiors", label: "Civil & Interiors", href: "/category/cement",
    items: [{ slug: "cement", label: "Cement", href: "/category/cement" }],
  }]);
  assert.deepEqual(nav.slugs, ["cement"]);
});

test("secondary categories are not navbar departments, but count as shown", () => {
  const nav = buildCategoryNav(buildCategoryDirectory(rows(() => false, [{ slug: "power-tools", count: 3 }, { slug: "empty-tools", count: 0 }])));
  assert.deepEqual(nav.departments, []);
  assert.deepEqual(nav.slugs, ["power-tools"]);
});

test("nothing shown: no links at all", () => {
  assert.deepEqual(buildCategoryNav(buildCategoryDirectory(rows(() => false))), { departments: [], slugs: [] });
});

test("hero banners: one linking a hidden category is dropped whole; the launch banner always stays", async () => {
  const { HERO_BANNERS } = await import("@/lib/merchandising/home");
  const { withShownCategoryLinks, categorySlugOf } = await import("@/lib/category-nav");
  const linked = HERO_BANNERS.flatMap((b) => [b.primary, b.secondary].flatMap((l) => (l ? [categorySlugOf(l.href)] : []))).filter((s): s is string => s !== null);
  assert.deepEqual(withShownCategoryLinks(HERO_BANNERS, linked).map((b) => b.id), HERO_BANNERS.map((b) => b.id));
  // Cement-only launch: neither category banner survives.
  assert.deepEqual(withShownCategoryLinks(HERO_BANNERS, ["cement"]).map((b) => b.id), ["launch"]);
  // One of a banner's two categories hidden is enough to drop it.
  assert.deepEqual(withShownCategoryLinks(HERO_BANNERS, linked.filter((s) => s !== "general-hardware-tools")).map((b) => b.id), ["launch", "interiors"]);
});

test("categorySlugOf reads category links only", async () => {
  const { categorySlugOf } = await import("@/lib/category-nav");
  assert.equal(categorySlugOf("/category/cement"), "cement");
  assert.equal(categorySlugOf("/category/cement?grade=53"), "cement");
  assert.equal(categorySlugOf("/categories"), null);
  assert.equal(categorySlugOf("/how-we-work"), null);
});

test("directory read fails: no category links at all, and the failure is reported", async () => {
  const { categoryNavOrEmpty } = await import("@/lib/category-nav");
  const errors: unknown[] = [];
  const nav = await categoryNavOrEmpty(async () => { throw new Error("database unreachable"); }, (e) => errors.push(e));
  assert.deepEqual(nav, { departments: [], slugs: [] }, "never a fixed fallback list that could name a hidden category");
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /database unreachable/);
});

test("directory read succeeds: the navigation is built from it and nothing is reported", async () => {
  const { categoryNavOrEmpty } = await import("@/lib/category-nav");
  const errors: unknown[] = [];
  const nav = await categoryNavOrEmpty(async () => buildCategoryDirectory(rows((s) => s === "cement")), (e) => errors.push(e));
  assert.deepEqual(nav.slugs, ["cement"]);
  assert.equal(errors.length, 0);
});
