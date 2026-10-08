import { test } from "node:test";
import assert from "node:assert/strict";
import { unlistedCategories } from "@/lib/category-index";

/**
 * The category index appends active, non-empty categories that its curated
 * taxonomy does not name — so catalogue imports (Power Tools, Spare Parts…)
 * are browsable without hardcoding slugs that would 404 where they are absent.
 */
const row = (slug: string, group: string, products: number, isActive = true) => ({
  slug, name: slug.toUpperCase(), group, isActive, _count: { products },
});

test("appends only active, non-empty, unlisted categories, under their group's title", () => {
  const out = unlistedCategories(
    [
      row("cement", "civil_interiors", 4),
      row("power-tools", "tools", 204),
      row("spare-parts-accessories", "tools", 15),
      row("cctv-security", "electrical", 0),
      row("steel-rebars", "civil_interiors", 6, false),
    ],
    new Set(["cement"])
  );
  assert.deepEqual([...out.keys()], ["Furniture & Architectural Hardware"]);
  assert.deepEqual(out.get("Furniture & Architectural Hardware")!.map((c) => c.slug), ["power-tools", "spare-parts-accessories"]);
});

test("an unknown group falls back to Furniture & Architectural Hardware, never dropped", () => {
  const out = unlistedCategories([row("misc", "something_new", 1)], new Set());
  assert.deepEqual(out.get("Furniture & Architectural Hardware")!.map((c) => c.slug), ["misc"]);
});
