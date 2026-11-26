import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCategoryDirectory,
  comingSoonNextSteps,
  directoryEntries,
  isCuratedCategory,
  isDiscoverable,
  PRIMARY_GROUPS,
  SECONDARY_GROUP,
} from "@/lib/category-directory";
import { CATEGORY_IMAGERY } from "@/lib/merchandising/home";

/**
 * Discovery is separate from publication (owner, 12 Oct 2026): the shop's
 * designated material categories are shown even before a product is approved,
 * as "Coming soon"; nothing else changes about which products are visible.
 */
const row = (slug: string, count: number, active = true, group = "civil_interiors") => ({ slug, name: `db:${slug}`, group, isActive: active, _count: { products: count } });

test("the four material departments, in order, with the owner's categories", () => {
  assert.deepEqual(PRIMARY_GROUPS.map((g) => g.title), [
    "Civil & Interiors",
    "Furniture & Architectural Hardware",
    "Electrical",
    "Plumbing, Sanitary & Bath",
  ]);
  assert.deepEqual(PRIMARY_GROUPS[0].categories.map((c) => c.slug), ["cement", "tiling", "painting", "waterproofing", "plywood-mdf-hdhmr", "fevicol"]);
  const all = PRIMARY_GROUPS.flatMap((g) => g.categories.map((c) => c.slug));
  assert.equal(new Set(all).size, all.length, "a category is in two departments");
  assert.equal(all.length, 20);
});

test("every designated category has a generated, provenance-recorded picture", () => {
  for (const slug of PRIMARY_GROUPS.flatMap((g) => g.categories.map((c) => c.slug))) {
    const pic = CATEGORY_IMAGERY[slug];
    assert.ok(pic, `${slug} has no category picture`);
    assert.match(pic.src, /^\/merchandising\/category-tiles\//, `${slug} must use the generated tile set, not /categories/ composites`);
  }
});

test("an active designated category with nothing visible is coming soon; one with products is available", () => {
  const d = buildCategoryDirectory([row("cement", 0), row("tiling", 3)]);
  const byslug = Object.fromEntries(directoryEntries(d).map((e) => [e.slug, e]));
  assert.equal(byslug.cement.state, "coming_soon");
  assert.equal(byslug.tiling.state, "available");
  assert.equal(byslug.cement.name, "Cement", "display names come from the directory, not the database row");
});

test("inactive or missing categories never appear (they would 404)", () => {
  const d = buildCategoryDirectory([row("cement", 5, false), row("tiling", 0)]);
  const slugs = directoryEntries(d).map((e) => e.slug);
  assert.deepEqual(slugs, ["tiling"]);
});

test("undesignated categories go last, under Tools & Equipment, and only when stocked", () => {
  const d = buildCategoryDirectory([
    row("power-tools", 204, true, "tools"),
    row("empty-import", 0, true, "tools"),
    row("cement", 0),
    row("lighting", 2, true, "electrical"),
  ]);
  assert.deepEqual(d.map((g) => g.title), ["Civil & Interiors", "Electrical", SECONDARY_GROUP.title]);
  assert.deepEqual(d.at(-1)!.categories.map((c) => c.slug), ["power-tools"]);
  assert.equal(d.at(-1)!.primary, false);
});

test("a database label is never renamed: Adhesives & Sealants keeps the fevicol slug", () => {
  const d = buildCategoryDirectory([row("fevicol", 0)]);
  const e = directoryEntries(d)[0];
  assert.equal(e.slug, "fevicol");
  assert.equal(e.name, "Adhesives & Sealants");
});

test("which category pages exist", () => {
  assert.equal(isDiscoverable(row("cement", 0)), true);
  assert.equal(isDiscoverable(row("cement", 0, false)), false);
  assert.equal(isDiscoverable(row("power-tools", 0, true, "tools")), false);
  assert.equal(isDiscoverable(row("power-tools", 1, true, "tools")), true);
  assert.equal(isCuratedCategory("steel-rebars"), false);
});

/* Issue #26: a coming-soon page always has somewhere to go, and never offers
   another empty page. */
test("coming-soon next steps: department siblings first, only stocked ones", () => {
  const d = buildCategoryDirectory([row("cement", 0), row("tiling", 3), row("painting", 0), row("fevicol", 1)]);
  const next = comingSoonNextSteps(d, "cement");
  assert.deepEqual(next.department.map((c) => c.slug), ["tiling", "fevicol"]);
  assert.equal(next.department.some((c) => c.slug === "cement" || c.state !== "available"), false);
});

test("coming-soon next steps: an empty department is topped up from the others", () => {
  const d = buildCategoryDirectory([
    row("cpvc-pipes-overhead-tanks", 0, true, "plumbing_bath"),
    row("sanitary-bath-fittings", 0, true, "plumbing_bath"),
    row("tiling", 2),
    row("lighting", 1, true, "electrical"),
    row("cement", 0),
  ]);
  const next = comingSoonNextSteps(d, "cpvc-pipes-overhead-tanks");
  assert.deepEqual(next.department, []);
  assert.deepEqual(next.elsewhere.map((c) => c.slug), ["tiling", "lighting"]);
});

test("coming-soon next steps: a well-stocked department needs nothing from elsewhere", () => {
  const d = buildCategoryDirectory([row("cement", 0), row("tiling", 1), row("painting", 1), row("waterproofing", 1), row("fevicol", 1), row("lighting", 1, true, "electrical")]);
  const next = comingSoonNextSteps(d, "cement");
  assert.equal(next.department.length, 4);
  assert.deepEqual(next.elsewhere, []);
});

test("coming-soon next steps: nothing stocked anywhere yields empty lists, not an error", () => {
  const d = buildCategoryDirectory([row("cement", 0), row("tiling", 0)]);
  assert.deepEqual(comingSoonNextSteps(d, "cement"), { department: [], elsewhere: [] });
});

test("a category with exactly one visible product is available, not coming soon", () => {
  const [entry] = directoryEntries(buildCategoryDirectory([row("tiling", 1)]));
  assert.equal(entry.state, "available");
});
