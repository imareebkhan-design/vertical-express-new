import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { MobileCategoriesView } from "@/components/mobile/categories/mobile-categories-view";

afterEach(cleanup);
const row = (slug: string, count: number, active = true) => ({ slug, name: slug, group: "civil_interiors", isActive: active, _count: { products: count } });

test("phone categories hide inactive and empty curated entries but append eligible new entries", () => {
  render(<MobileCategoriesView categories={[row("cement", 1), row("tiling", 0), row("painting", 3, false), row("new-reviewed-category", 2)]} />);
  const links = screen.getAllByRole("link").map(l => l.getAttribute("href"));
  assert.ok(links.includes("/category/cement"));
  assert.ok(links.includes("/category/new-reviewed-category"));
  assert.ok(!links.includes("/category/tiling"));
  assert.ok(!links.includes("/category/painting"));
  assert.equal(links.filter(l => l?.startsWith("/category/")).length, 2);
});

test("no authoritative visible category means an empty screen, not the fixed taxonomy", () => {
  render(<MobileCategoriesView categories={[]} />);
  assert.ok(screen.getByText("No categories are available yet."));
  assert.equal(screen.queryAllByRole("button").length, 0);
  assert.equal(screen.queryAllByRole("link").filter(l => l.getAttribute("href")?.startsWith("/category/")).length, 0);
});
