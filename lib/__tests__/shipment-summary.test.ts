import test from "node:test";
import assert from "node:assert/strict";
import { summariseShipments } from "@/lib/shipment-summary";

const s = (status: string, speedClass = "scheduled") => ({ status, speedClass });

test("an order with no shipments reads as a dash, never as zero", () => {
  assert.deepEqual(summariseShipments([]), { count: 0, label: "—", needsDispatch: false });
  assert.equal(summariseShipments([s("cancelled")]).label, "—", "all-cancelled is not a live shipment");
});

test("a split order says how many, and how far along", () => {
  assert.equal(summariseShipments([s("pending"), s("pending")]).label, "2 · awaiting dispatch");
  assert.equal(summariseShipments([s("out_for_delivery"), s("pending")]).label, "2 · 1 on the way");
  assert.equal(summariseShipments([s("delivered"), s("pending")]).label, "2 · 1 of 2 delivered");
  assert.equal(summariseShipments([s("delivered"), s("delivered")]).label, "2 · all delivered");
  assert.equal(summariseShipments([s("out_for_delivery")]).label, "1 · on the way");
});

test("needsDispatch flags only shipments still waiting for a driver", () => {
  assert.equal(summariseShipments([s("pending"), s("out_for_delivery")]).needsDispatch, true);
  assert.equal(summariseShipments([s("out_for_delivery")]).needsDispatch, false);
  assert.equal(summariseShipments([s("delivered")]).needsDispatch, false);
});
