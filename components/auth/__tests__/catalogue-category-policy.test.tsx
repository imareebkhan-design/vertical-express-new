import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { MobileCategoriesView } from "@/components/mobile/categories/mobile-categories-view";
import { Categories } from "@/components/sections/categories";
import { buildCategoryDirectory } from "@/lib/category-directory";

afterEach(cleanup);
const row = (slug: string, count: number, active = true, group = "civil_interiors") => ({ slug, name: slug, group, isActive: active, _count: { products: count } });

/* Owner, 12 Oct 2026: designated categories are discoverable before any product
   is approved ("Coming soon"); products themselves stay behind the gates. */
const DIRECTORY = buildCategoryDirectory([
  row("cement", 1),
  row("tiling", 0),
  row("painting", 3, false),
  row("new-reviewed-category", 2, true, "tools"),
  row("empty-imported", 0, true, "tools"),
]);

test("phone categories: designated empty categories show as coming soon; inactive and empty imported ones never show", () => {
  render(<MobileCategoriesView directory={DIRECTORY} />);
  const links = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
  assert.ok(links.includes("/category/cement"));
  assert.ok(links.includes("/category/tiling"), "a designated category with nothing approved yet must still be discoverable");
  assert.ok(links.includes("/category/new-reviewed-category"));
  assert.ok(!links.includes("/category/painting"), "an inactive category would 404");
  assert.ok(!links.includes("/category/empty-imported"), "an undesignated empty category is not announced");
  assert.ok(screen.getByRole("link", { name: "Tiling, coming soon" }));
  assert.ok(screen.getByRole("link", { name: "Cement" }));
});

test("a coming-soon tile carries no count, price or basket action", () => {
  const { container } = render(<MobileCategoriesView directory={DIRECTORY} />);
  const text = container.textContent ?? "";
  assert.doesNotMatch(text, /\d+\s+products?/i);
  assert.doesNotMatch(text, /₹/);
  assert.doesNotMatch(text, /add to (cart|basket)|in stock|out of stock/i);
  assert.equal(screen.queryAllByRole("button", { name: /add/i }).length, 0);
});

test("no category at all means an empty screen, not the fixed taxonomy", () => {
  render(<MobileCategoriesView directory={[]} />);
  assert.ok(screen.getByText("No categories are available yet."));
  assert.equal(screen.queryAllByRole("button").length, 0);
  assert.equal(screen.queryAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/category/")).length, 0);
});

test("material departments lead the home section; tools come last however many are approved", () => {
  const directory = buildCategoryDirectory([
    row("power-tools", 204, true, "tools"),
    row("cement", 0),
    row("wires-mcb-distribution-boards", 0, true, "electrical"),
  ]);
  render(<Categories directory={directory} />);
  const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
  assert.deepEqual(headings, ["Civil & Interiors", "Electrical", "Tools & Equipment"]);
  const viewAll = screen.getAllByRole("link", { name: /^View all/ }).map((l) => l.getAttribute("href"));
  assert.deepEqual(viewAll, ["/categories#civil_interiors", "/categories#electrical", "/categories#tools_equipment"]);
});

test("each department section is anchored for View all", () => {
  const { container } = render(<MobileCategoriesView directory={DIRECTORY} />);
  assert.ok(container.querySelector("#civil_interiors"));
  assert.ok(container.querySelector("#tools_equipment"));
});
