import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCartByShipment, type GroupableCartLine } from "../cart-shipments";
import { planShipments } from "../shipment-plan";

/**
 * W-18: the phone-web cart groups lines exactly as the desktop cart and checkout
 * persistence do. All of them now read `groupCartByShipment`, which must be
 * nothing but `planShipments` mapped back onto the lines.
 */

const line = (itemId: string, qty: number, bulk: boolean, speed: GroupableCartLine["deliverySpeed"] = null, paise = 1000) => ({
  itemId,
  qty,
  categoryIsBulk: bulk,
  deliverySpeed: speed,
  lineTotalPaise: paise * qty,
  title: `Item ${itemId}`,
});

test("a mixed basket splits into the quick run first, then the truck", () => {
  const lines = [line("cement", 2, true), line("wire", 1, false), line("tile", 3, true), line("switch", 4, false)];
  const groups = groupCartByShipment(lines);
  assert.deepEqual(
    groups.map((g) => ({ seq: g.sequence, speed: g.speedClass, ids: g.lines.map((l) => l.itemId) })),
    [
      { seq: 1, speed: "express", ids: ["wire", "switch"] },
      { seq: 2, speed: "scheduled", ids: ["cement", "tile"] },
    ]
  );
  assert.equal(groups[0].itemCount, 5, "units, not lines");
  assert.equal(groups[1].totalPaise, 5000);
  assert.equal(groups[0].lines[0].title, "Item wire", "the original line objects come back");
});

test("it is exactly the persisted plan, line for line", () => {
  const lines = [line("a", 1, true), line("b", 2, false, "scheduled"), line("c", 1, true, "express"), line("d", 5, false)];
  const plan = planShipments(lines.map((l) => ({ ref: l.itemId, qty: l.qty, categoryIsBulk: l.categoryIsBulk, deliverySpeed: l.deliverySpeed })));
  const groups = groupCartByShipment(lines);
  assert.deepEqual(
    groups.map((g) => ({ sequence: g.sequence, speedClass: g.speedClass, lines: g.lines.map((l) => ({ ref: l.itemId, qty: l.qty })) })),
    plan
  );
});

test("a product's own delivery speed overrides its category", () => {
  const groups = groupCartByShipment([line("heavy-but-quick", 1, true, "express"), line("light-but-truck", 1, false, "scheduled")]);
  assert.deepEqual(groups.map((g) => [g.speedClass, g.lines[0].itemId]), [["express", "heavy-but-quick"], ["scheduled", "light-but-truck"]]);
});

test("one kind of goods is one shipment; an empty cart is none", () => {
  assert.equal(groupCartByShipment([line("a", 1, false), line("b", 2, false)]).length, 1);
  assert.deepEqual(groupCartByShipment([]), []);
});
