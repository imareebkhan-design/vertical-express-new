import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCartByShipment } from "@/lib/cart-shipments";
import { planShipments } from "@/lib/shipment-plan";

/**
 * E7 — the split shown at checkout when express is chosen must be the split
 * placement persists (`placeOrder` → `planShipments` with `onExpressRun`).
 */

const line = (itemId: string, variantId: string, categoryIsBulk: boolean, deliverySpeed: "express" | "scheduled" | null = null) => ({
  itemId,
  variantId,
  qty: 1,
  categoryIsBulk,
  deliverySpeed,
  lineTotalPaise: 1000,
});

const mixed = [line("i-switch", "v-switch", false), line("i-tape", "v-tape", false), line("i-cement", "v-cement", true)];

test("express chosen on a mixed basket: the express run is its own first shipment, the rest split as before", () => {
  const groups = groupCartByShipment(mixed, ["v-switch"]);
  assert.deepEqual(
    groups.map((g) => [g.sequence, g.speedClass, g.expressRun ?? false, g.lines.map((l) => l.itemId)]),
    [
      [1, "express", true, ["i-switch"]],
      [2, "express", false, ["i-tape"]],
      [3, "scheduled", false, ["i-cement"]],
    ]
  );
});

test("no express run: exactly the split without express", () => {
  assert.deepEqual(groupCartByShipment(mixed, []), groupCartByShipment(mixed));
  assert.deepEqual(
    groupCartByShipment(mixed).map((g) => [g.speedClass, g.expressRun ?? false, g.lines.length]),
    [["express", false, 2], ["scheduled", false, 1]]
  );
});

test("a truck line is never put on the express run, even if named", () => {
  const groups = groupCartByShipment(mixed, ["v-cement", "v-switch"]);
  const truck = groups.find((g) => g.lines.some((l) => l.itemId === "i-cement"))!;
  assert.equal(truck.speedClass, "scheduled");
  assert.equal(truck.expressRun, undefined);
  /* The planner itself, as placement calls it. */
  const planned = planShipments([{ ref: "c", qty: 1, categoryIsBulk: true, onExpressRun: true }]);
  assert.deepEqual(planned, [{ sequence: 1, speedClass: "scheduled", lines: [{ ref: "c", qty: 1 }] }]);
});

test("a product whose own speed is truck stays on the truck even in a bike category", () => {
  const groups = groupCartByShipment([line("i-box", "v-box", false, "scheduled")], ["v-box"]);
  assert.deepEqual(groups.map((g) => [g.speedClass, g.expressRun ?? false]), [["scheduled", false]]);
});
