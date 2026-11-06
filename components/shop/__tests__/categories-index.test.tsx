import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MobileCategoriesView } from "@/components/mobile/categories/mobile-categories-view";
import { buildCategoryDirectory } from "@/lib/category-directory";

afterEach(cleanup);

const row = (slug: string, count: number, group = "civil_interiors") => ({ slug, name: slug, group, isActive: true, _count: { products: count } });

/* Issue #26: every tile on the index opens a page (coming-soon ones included),
   and the department headings carry the artboard's category count. */
test("phone index: every tile links to its category; coming-soon tiles are labelled, not hidden", () => {
  const directory = buildCategoryDirectory([row("cement", 0), row("tiling", 4), row("lighting", 1, "electrical")]);
  render(<MobileCategoriesView directory={directory} />);
  const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/category/"));
  assert.deepEqual(links.map((a) => a.getAttribute("href")), ["/category/cement", "/category/tiling", "/category/lighting"]);
  assert.ok(screen.getByRole("link", { name: "Cement, coming soon" }));
  assert.ok(screen.getByRole("link", { name: "Tiling" }));
  assert.ok(screen.getByText("3 categories"));
  const civil = screen.getByRole("heading", { name: /Civil & Interiors/ });
  assert.match(civil.textContent ?? "", /2 categories$/);
  assert.equal(within(civil).queryByText(/products/), null, "never a product count on the index");
});
