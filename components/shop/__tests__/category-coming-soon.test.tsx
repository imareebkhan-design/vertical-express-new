import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CategoryComingSoon } from "@/components/shop/category-coming-soon";
import type { DirectoryEntry } from "@/lib/category-directory";

afterEach(cleanup);

const entry = (slug: string, shortName: string): DirectoryEntry => ({ slug, name: shortName, shortName, state: "available", visibleProducts: 3 });

test("an empty department still offers stocked categories elsewhere, then the index (issue #26)", () => {
  render(<CategoryComingSoon slug="cpvc-pipes-overhead-tanks" name="CPVC Pipes & Overhead Tanks" siblings={[]} elsewhere={[entry("tiling", "Tiling"), entry("lighting", "Lighting")]} />);
  assert.ok(screen.getByRole("heading", { name: "CPVC Pipes & Overhead Tanks is on its way" }));
  assert.equal(screen.queryByRole("heading", { name: "Available in this department" }), null);
  const list = screen.getByRole("list", { name: "Available now" });
  assert.deepEqual(within(list).getAllByRole("link").map((a) => a.getAttribute("href")), ["/category/tiling", "/category/lighting"]);
  assert.equal(screen.getByRole("link", { name: /Browse all categories/ }).getAttribute("href"), "/categories");
});

test("department siblings come first; extras are labelled as such", () => {
  render(<CategoryComingSoon slug="cement" name="Cement" siblings={[entry("tiling", "Tiling")]} elsewhere={[entry("lighting", "Lighting")]} />);
  assert.ok(screen.getByRole("list", { name: "Available in this department" }));
  assert.ok(screen.getByRole("list", { name: "Also available" }));
});

test("makes no commercial claim: no price, count, stock or basket action", () => {
  const { container } = render(<CategoryComingSoon slug="cement" name="Cement" siblings={[entry("tiling", "Tiling")]} />);
  const text = container.textContent ?? "";
  assert.doesNotMatch(text, /₹|\bproducts?\b.*\d|\d+\s*products?|in stock|add to (cart|basket)|delivered (today|tomorrow)/i);
  assert.equal(screen.queryAllByRole("button").length, 0);
});
