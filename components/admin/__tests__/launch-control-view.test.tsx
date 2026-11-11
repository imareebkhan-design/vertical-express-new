import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LaunchControlView } from "@/components/admin/launch-control-view";
import { buildLaunchTree, type LaunchCategoryRow } from "@/lib/launch-control";
import { explainCatalogState, type CatalogStateSnapshot } from "@/lib/catalog-explain";
import type { LaunchCategoryView, LaunchOverview } from "@/lib/services/admin/launch-control";

afterEach(cleanup);

/**
 * Launch control is read-only in this release: it reports, it never offers a
 * control that looks like it changes the shop.
 */

const rows: LaunchCategoryRow[] = [
  { slug: "cement", name: "db cement", group: "civil_interiors", isActive: true, visible: 2, byStatus: { published: 2, draft: 1 }, hasTaxMapping: true },
  { slug: "tiling", name: "db tiling", group: "civil_interiors", isActive: false, visible: 0, byStatus: { published: 4 }, hasTaxMapping: true },
  { slug: "aggregates", name: "Aggregates", group: "civil_interiors", isActive: true, visible: 0, byStatus: { draft: 3 }, hasTaxMapping: false },
];

const overview = (orderingOpen: boolean): LaunchOverview => ({
  orderingOpen,
  strict: true,
  departments: buildLaunchTree(rows),
  totals: { categories: 3, categoriesReachable: 1, products: 10, visible: 2, visiblePublished: 2 },
});

const NOW = new Date("2026-11-11T00:00:00Z");
const snapshot = (over: Partial<CatalogStateSnapshot> = {}): CatalogStateSnapshot => ({
  slug: "x", status: "published", identityConfirmed: true, identityApprovedAt: NOW, identityApprovedBy: "r", identityApprovalReason: "ok",
  commercialReview: { approvedBy: "o" }, brand: { isActive: true }, category: { isActive: false },
  images: [{ licence: "manufacturer-official-dealer-use", sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT",
    severity: null, approvedAt: NOW, approvedBy: "r", approvalReason: "ok", sha256: "a".repeat(64) }],
  variants: [{ isDefault: true, isActive: true, pricePaise: 100, inventory: [{ warehouse: { isActive: true } }] }],
  ...over,
});

test("each category shows what customers see, with the shop's own names", () => {
  render(<LaunchControlView overview={overview(false)} selectedSlug={null} selected={null} />);
  const cement = screen.getByRole("link", { name: "Cement" }).closest("tr")!;
  assert.ok(within(cement).getByText("Shown"));
  const tiling = screen.getByRole("link", { name: "Tiling" }).closest("tr")!;
  assert.ok(within(tiling).getByText("Hidden"));
  assert.ok(within(tiling).getByText("4 published"));
  const aggregates = screen.getByRole("link", { name: "Aggregates" }).closest("tr")!;
  assert.ok(within(aggregates).getByText("Not listed"));
  assert.ok(within(aggregates).getByText("No HSN/GST"));
  // Designated categories absent from the data are reported, not linked.
  assert.equal(screen.queryByRole("link", { name: "Painting" }), null);
  assert.ok(screen.getAllByText("Not in database").length > 0);
});

test("the trading mode is stated plainly", () => {
  render(<LaunchControlView overview={overview(false)} selectedSlug={null} selected={null} />);
  assert.ok(screen.getByText("Enquiries"));
  cleanup();
  render(<LaunchControlView overview={overview(true)} selectedSlug={null} selected={null} />);
  assert.ok(screen.getByText("Orders"));
});

test("read-only: no switch, checkbox or form anywhere", () => {
  const selected: LaunchCategoryView = { slug: "tiling", name: "Tiling", isActive: false, total: 1, products: [] };
  render(<LaunchControlView overview={overview(true)} selectedSlug="tiling" selected={selected} />);
  assert.equal(document.querySelector("form, input, button, select, [role=switch]"), null);
});

test("the category view gives each product its outcome and every reason", () => {
  const hidden = explainCatalogState(snapshot({ status: "draft" }), { orderingOpen: false, strict: true });
  const selected: LaunchCategoryView = {
    slug: "tiling", name: "Tiling", isActive: false, total: 250,
    products: [{ id: "p1", slug: "vitrified-600", title: "Vitrified 600x600", status: "draft", brand: { name: "Acme Tiles", isActive: false }, state: hidden }],
  };
  render(<LaunchControlView overview={overview(false)} selectedSlug="tiling" selected={selected} />);
  const row = screen.getByRole("link", { name: "Vitrified 600x600" }).closest("tr")!;
  assert.equal(screen.getByRole("link", { name: "Vitrified 600x600" }).getAttribute("href"), "/admin/products/vitrified-600");
  assert.ok(within(row).getByText("Hidden"));
  assert.ok(within(row).getByText("The product is a draft"));
  assert.ok(within(row).getByText("The category is switched off"));
  assert.match(row.textContent ?? "", /brand switched off/);
  assert.match(document.body.textContent ?? "", /Showing 1 of 250 products/);
});

test("an unknown category says so", () => {
  render(<LaunchControlView overview={overview(false)} selectedSlug="nope" selected={null} />);
  assert.match(document.body.textContent ?? "", /No category called “nope”/);
});
