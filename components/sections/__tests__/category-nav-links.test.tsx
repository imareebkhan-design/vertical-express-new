import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { Footer } from "@/components/sections/footer";
import { QuantityHelpers } from "@/components/mobile/home/quantity-helpers";
import { CategoryNavProvider } from "@/components/shop/category-nav-provider";
import type { CategoryNav } from "@/lib/category-nav";

afterEach(cleanup);

/** ISS-102: links follow the shop's category directory, never a fixed list. */

const CEMENT_ONLY: CategoryNav = {
  departments: [{ key: "civil_interiors", label: "Civil & Interiors", href: "/category/cement",
    items: [{ slug: "cement", label: "Cement", href: "/category/cement" }] }],
  slugs: ["cement"],
};

const hrefs = () => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));

test("footer: only the departments the shop shows, plus All categories", () => {
  render(<CategoryNavProvider nav={CEMENT_ONLY}><Footer /></CategoryNavProvider>);
  assert.ok(screen.getByRole("link", { name: "Civil & Interiors" }));
  assert.equal(screen.queryByRole("link", { name: "Electrical" }), null);
  assert.ok(hrefs().includes("/categories"));
  assert.deepEqual(hrefs().filter((h) => h?.startsWith("/category/")), ["/category/cement"]);
});

test("footer keeps its own label for Plumbing", () => {
  const nav: CategoryNav = { departments: [{ key: "plumbing_bath", label: "Plumbing & Bath", href: "/category/cpvc-pipes-overhead-tanks", items: [] }], slugs: [] };
  render(<CategoryNavProvider nav={nav}><Footer /></CategoryNavProvider>);
  assert.ok(screen.getByRole("link", { name: "Plumbing, Sanitary & Bath" }));
});

test("footer without a directory: no category links, All categories still there", () => {
  render(<Footer />);
  assert.deepEqual(hrefs().filter((h) => h?.startsWith("/category/")), []);
  assert.ok(hrefs().includes("/categories"));
});

test("quantity helpers: a card only for a category that is shown", () => {
  render(<CategoryNavProvider nav={CEMENT_ONLY}><QuantityHelpers /></CategoryNavProvider>);
  assert.ok(screen.getByRole("link", { name: "Cement for plaster. Opens Cement." }));
  assert.equal(screen.queryByRole("link", { name: /Opens Painting/ }), null);
  assert.equal(screen.queryByRole("link", { name: /Opens Tiling/ }), null);
});

test("quantity helpers: none shown, no strip at all", () => {
  render(<QuantityHelpers />);
  assert.equal(screen.queryByRole("heading", { name: "How much do I need?" }), null);
});
