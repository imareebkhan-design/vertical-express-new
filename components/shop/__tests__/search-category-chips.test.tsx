import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SearchCategoryChips } from "@/components/shop/search-category-chips";
import { searchCategoryHref } from "@/lib/search-url";

afterEach(cleanup);

const SHELVES = [
  { slug: "cement", name: "Cement", count: 23 },
  { slug: "adhesives", name: "Adhesives & Sealants", count: 6 },
  { slug: "waterproofing", name: "Waterproofing", count: 2 },
];
const CURRENT = new URLSearchParams({ q: "cement 50 kg", brand: "ultratech", minPrice: "300", sort: "price_asc", page: "3" });
const hrefFor = (slug: string | null) => searchCategoryHref(CURRENT, slug);

const params = (a: HTMLElement) => new URL(a.getAttribute("href")!, "http://localhost").searchParams;

test("each shelf is a link carrying the query and filters, with its count", () => {
  render(<SearchCategoryChips categories={SHELVES} selected={null} hrefFor={hrefFor} />);
  const nav = screen.getByRole("navigation", { name: "Search within a category" });
  const links = within(nav).getAllByRole("link");
  assert.deepEqual(
    links.map((l) => l.textContent),
    ["Cement23", "Adhesives & Sealants6", "Waterproofing2"]
  );
  const p = params(within(nav).getByRole("link", { name: /Adhesives & Sealants, 6 results/ }));
  assert.equal(p.get("category"), "adhesives");
  assert.equal(p.get("q"), "cement 50 kg");
  assert.equal(p.get("brand"), "ultratech");
  assert.equal(p.get("minPrice"), "300");
  assert.equal(p.get("sort"), "price_asc");
  assert.equal(p.get("page"), null);
  assert.equal(links.some((l) => l.getAttribute("aria-current")), false);
});

test("a picked shelf shows alone, marked current, and its link clears it", () => {
  render(<SearchCategoryChips categories={[SHELVES[1]]} selected="adhesives" hrefFor={hrefFor} />);
  const link = screen.getByRole("link", { name: /Adhesives & Sealants, 6 results — clear category/ });
  assert.equal(link.getAttribute("aria-current"), "true");
  const p = params(link);
  assert.equal(p.get("category"), null);
  assert.equal(p.get("brand"), "ultratech", "clearing the shelf keeps the other filters");
  assert.equal(screen.getAllByRole("link").length, 1);
});

test("one shelf only, and nothing picked: no chips", () => {
  const { container } = render(<SearchCategoryChips categories={[SHELVES[0]]} selected={null} hrefFor={hrefFor} />);
  assert.equal(container.innerHTML, "");
});

test("a picked shelf with no matches still offers the way out", () => {
  render(<SearchCategoryChips categories={[]} selected="tiles" hrefFor={hrefFor} />);
  const out = screen.getByRole("link", { name: "Show all categories" });
  assert.equal(params(out).get("category"), null);
  assert.equal(params(out).get("q"), "cement 50 kg");
});
