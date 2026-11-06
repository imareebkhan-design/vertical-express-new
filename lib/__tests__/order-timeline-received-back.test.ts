import test from "node:test";
import assert from "node:assert/strict";
import { buildOrderTimeline } from "@/lib/order-timeline";

/* A shipment received back without a handover is said in words on the order's
   history — never shown as a delivery, and never as a bare status flip. */
test("a shipment received back reads as returned to the warehouse, not handed over, with the reason", () => {
  const t0 = new Date("2026-10-16T00:00:00Z");
  const entries = buildOrderTimeline({
    placedAt: t0, userId: "u", paymentMethod: "razorpay", payments: [], statusEvents: [],
    shipments: [{ id: "s1", sequence: 1 }], drivers: {},
    audits: [{
      id: "a1", action: "shipment.received_back", entityType: "shipment", entityId: "s1", actorType: "admin",
      after: { status: "packed", reason: "Dispatched by mistake", deliveryCodeRevoked: true }, createdAt: new Date(t0.getTime() + 60_000),
    }],
  });
  const e = entries.find((x) => x.id === "au-a1");
  assert.ok(e, "shown");
  assert.equal(e!.title, "Shipment returned to the warehouse — not handed over");
  assert.match(e!.detail ?? "", /Dispatched by mistake/);
  assert.match(e!.detail ?? "", /delivery code revoked/);
  assert.match(e!.detail ?? "", /by an operator/);
  assert.equal(e!.tone, "warn");
});
