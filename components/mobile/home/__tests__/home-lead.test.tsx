import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirstOrderCard, HomeSearchPill, NotificationsBell, OrderAgainRail } from "@/components/mobile/home/home-lead";
import { QuantityHelpers } from "@/components/mobile/home/quantity-helpers";
import type { OrderAgainItem } from "@/lib/order-again";

afterEach(cleanup);

const ITEMS: OrderAgainItem[] = [
  { variantId: "v1", productSlug: "ppc-cement", title: "PPC Cement, 50 kg Bag", variantName: "50 kg bag", imageUrl: null, lastQty: 40, lastOrderedAt: "2026-08-15T06:00:00Z", timesOrdered: 3 },
  { variantId: "v2", productSlug: "fr-wire", title: "FR Wire 2.5 sq mm", variantName: "90 m coil", imageUrl: null, lastQty: 2, lastOrderedAt: "2026-09-01T06:00:00Z", timesOrdered: 1 },
];

test("W-07: a returning customer's rail shows their own items, what they took and when — never a price", () => {
  render(<OrderAgainRail items={ITEMS} totalOrders={7} onAdd={() => {}} />);
  assert.ok(screen.getByRole("heading", { name: "Order again" }));
  const cement = screen.getByRole("link", { name: "PPC Cement, 50 kg Bag, last ordered 40 on 15 Aug" });
  assert.equal(cement.getAttribute("href"), "/product/ppc-cement");
  assert.equal(screen.getByRole("link", { name: "See all 7" }).getAttribute("href"), "/account/orders");
  assert.doesNotMatch(document.body.textContent ?? "", /₹/);
});

test("W-07: adding from the rail adds that item", async () => {
  const added: string[] = [];
  render(<OrderAgainRail items={ITEMS} totalOrders={2} onAdd={(i) => added.push(i.variantId)} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Add FR Wire 2.5 sq mm to cart" }));
  assert.deepEqual(added, ["v2"]);
});

test("W-07: nothing to reorder draws nothing", () => {
  const { container } = render(<OrderAgainRail items={[]} totalOrders={0} onAdd={() => {}} />);
  assert.equal(container.innerHTML, "");
});

test("W-07: the first-run card promises no saved list", () => {
  render(<FirstOrderCard />);
  const text = document.body.textContent ?? "";
  assert.doesNotMatch(text, /\blists?\b/i);
  assert.doesNotMatch(text, /running low/i);
  assert.match(text, /order again/);
  assert.equal(screen.getByRole("link", { name: "Add materials" }).getAttribute("href"), "/categories");
});

test("W-19: the bell goes nowhere — disabled, not a link to an unrelated page", () => {
  render(<NotificationsBell />);
  const bell = screen.getByRole("button", { name: "Notifications, not available yet" }) as HTMLButtonElement;
  assert.equal(bell.disabled, true);
  assert.equal(screen.queryByRole("link"), null);
});

test("W-20: the estimator strip does not claim to calculate; each card says where it goes", () => {
  render(<QuantityHelpers />);
  const text = document.body.textContent ?? "";
  assert.doesNotMatch(text, /from a room size|Not a quote/);
  assert.match(text, /Quantity estimates are coming\. Start with the material\./);
  assert.equal(screen.getByRole("link", { name: "Paint for a room. Opens Painting." }).getAttribute("href"), "/category/painting");
});

test("W-07: the returning home's search pill opens search", () => {
  render(<HomeSearchPill />);
  assert.equal(screen.getByRole("link", { name: /Search cement, wire, fittings/ }).getAttribute("href"), "/search");
});
