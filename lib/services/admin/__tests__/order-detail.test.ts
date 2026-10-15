import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { adminOrderDetail } from "@/lib/services/admin/order-detail";
import { assignShipment, advanceShipment, confirmDelivery } from "@/lib/services/admin/shipments-write";
import { createDriver } from "@/lib/services/admin/roster-write";

/**
 * The order screen's timeline is built only from persisted rows: placement,
 * payments, status events and the shipment audit trail. Walk a real order
 * through pack → assign → dispatch → code-confirmed delivery and check every
 * step appears once, in order, with the stored time — and that the delivery
 * code itself is in no audit row the timeline reads.
 */
const TAG = `ZZZOD${Date.now() % 1_000_000}`;
let userId = "";
let warehouseId = "";
let driverId = "";
const PLACED = new Date(Date.now() - 3_600_000);
const actor = () => ({ id: userId, email: "zzz-od@demo.invalid" });

before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID() } })).id;
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} W`, city: "Srinagar", pincode: "190001" } })).id;
  const d = await createDriver({ name: `${TAG} Rider`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, actor: actor() });
  driverId = d.ok ? d.id : "";
});

after(async () => {
  const orders = await db.order.findMany({ where: { orderNo: { startsWith: TAG } }, select: { id: true, shipments: { select: { id: true } } } });
  const ids = orders.map((o) => o.id);
  const sids = orders.flatMap((o) => o.shipments.map((s) => s.id));
  await db.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...sids, driverId] } } });
  await db.shipmentLiveLocation.deleteMany({ where: { shipmentId: { in: sids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.driver.deleteMany({ where: { id: driverId } });
  await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.delete({ where: { id: userId } });
});

test("timeline: placed → payment → packed → assigned → dispatched → delivered with code, from real rows", async () => {
  const order = await db.order.create({
    data: {
      orderNo: `${TAG}-1`, userId, status: "confirmed", paymentMethod: "razorpay", subtotalPaise: 5000, totalPaise: 5000, warehouseId,
      placedAt: PLACED,
      address: { name: "Bilal", phone: "+919800000000", line1: "1 Road", city: "Srinagar", pincode: "190001", latitude: 34.08, longitude: 74.79 },
      payments: { create: { gateway: "razorpay", amountPaise: 5000, status: "captured", gatewayPaymentId: "pay_TEST123", signatureVerified: true } },
    },
  });
  const sh = await db.shipment.create({ data: { orderId: order.id, sequence: 1, speedClass: "express", status: "pending", warehouseId } });
  assert.equal((await advanceShipment({ shipmentId: sh.id, to: "packed", actor: actor() })).ok, true);
  assert.equal((await assignShipment({ shipmentId: sh.id, driverId, actor: actor() })).ok, true);
  assert.equal((await advanceShipment({ shipmentId: sh.id, to: "out_for_delivery", actor: actor() })).ok, true);
  const code = (await db.shipment.findUniqueOrThrow({ where: { id: sh.id } })).deliveryCode!;
  assert.equal((await confirmDelivery({ shipmentId: sh.id, code, actor: actor() })).ok, true);

  const d = await adminOrderDetail(`${TAG}-1`);
  assert.ok(d);
  const titles = d.timeline.map((e) => e.title);
  assert.equal(titles[0], "Order placed");
  assert.equal(d.timeline[0].at.toISOString(), PLACED.toISOString(), "the stored placement time, not now");
  for (const t of ["Payment started (razorpay)", "Payment captured", "Shipment packed", `Shipment assigned to ${TAG} Rider`, "Shipment dispatched — out for delivery", "Shipment delivered"]) {
    assert.equal(titles.filter((x) => x === t).length, 1, `exactly one "${t}"`);
  }
  assert.ok(titles.indexOf("Shipment packed") < titles.indexOf("Shipment dispatched — out for delivery"));
  assert.ok(titles.indexOf("Shipment dispatched — out for delivery") < titles.indexOf("Shipment delivered"));
  assert.match(d.timeline.find((e) => e.title === "Shipment delivered")!.detail ?? "", /customer's delivery code/);
  assert.ok(titles.includes("Order Out for delivery → Delivered"), "the roll-up's recorded event");
  for (let i = 1; i < d.timeline.length; i++) assert.ok(d.timeline[i - 1].at <= d.timeline[i].at, "chronological");

  /* The code is never in what the timeline reads. */
  const audits = await db.auditLog.findMany({ where: { entityId: sh.id } });
  assert.ok(!JSON.stringify(audits).includes(code), "delivery code absent from the audit trail");
  assert.ok(!JSON.stringify(d.timeline).includes(code), "and from the timeline");
});

test("an order with no payment and no shipments shows only what happened", async () => {
  await db.order.create({
    data: { orderNo: `${TAG}-2`, userId, status: "confirmed", paymentMethod: "cod", subtotalPaise: 100, totalPaise: 100, address: { name: "X" } },
  });
  const d = await adminOrderDetail(`${TAG}-2`);
  assert.deepEqual(d!.timeline.map((e) => e.title), ["Order placed"]);
});

test("the customer's own placement event is not duplicated or credited to an operator", async () => {
  const o = await db.order.create({
    data: {
      orderNo: `${TAG}-3`, userId, status: "pending_payment", paymentMethod: "razorpay", subtotalPaise: 100, totalPaise: 100, address: { name: "X" },
      statusEvents: { create: [{ toStatus: "pending_payment", actorUserId: userId, note: "Order placed" }] },
    },
  });
  await db.orderStatusEvent.create({ data: { orderId: o.id, fromStatus: "pending_payment", toStatus: "cancelled", actorUserId: userId, note: "Customer cancelled" } });
  const d = await adminOrderDetail(`${TAG}-3`);
  const t = d!.timeline;
  assert.equal(t.filter((e) => /placed/i.test(e.title)).length, 1);
  assert.match(t.at(-1)!.detail ?? "", /by the customer/);
  assert.ok(!JSON.stringify(t).includes("by an operator"));
});
