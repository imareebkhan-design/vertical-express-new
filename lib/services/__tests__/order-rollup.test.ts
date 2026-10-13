import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { assignShipment, advanceShipment, confirmDelivery } from "@/lib/services/admin/shipments-write";
import { advanceOrderStatus } from "@/lib/services/admin/manage";
import { afterOrderRollup, forwardSteps, targetFromShipments } from "@/lib/services/order-rollup";
import { createDriver } from "@/lib/services/admin/roster-write";

/**
 * The order follows its shipments (O-QA-5, 14 Oct): a single-shipment order
 * delivered against the customer's code stayed `confirmed`. Delivered only when
 * every live shipment is delivered; forward only; one event per step; stock
 * untouched; cashback at most once, and a cashback failure after commit never
 * undoes the delivery.
 */
const tag = randomUUID().slice(0, 8);
let userId = "";
let actorId = "";
let warehouseId = "";
let driverId = "";
const actor = () => ({ id: actorId, email: "zzz-rollup@demo.invalid" });
let n = 0;

before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  actorId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ ROLL ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  const d = await createDriver({ name: `ZZZ Roll ${tag}`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, actor: actor() });
  driverId = d.ok ? d.id : "";
});

after(async () => {
  const orders = await db.order.findMany({ where: { orderNo: { startsWith: `ZZZROLL-${tag}` } }, select: { id: true } });
  const oids = orders.map((o) => o.id);
  const sids = (await db.shipment.findMany({ where: { orderId: { in: oids } }, select: { id: true } })).map((s) => s.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: [...oids, ...sids, driverId] } } });
  await db.walletTransaction.deleteMany({ where: { referenceId: { in: oids } } });
  await db.shipmentLiveLocation.deleteMany({ where: { shipmentId: { in: sids } } });
  await db.shipment.deleteMany({ where: { id: { in: sids } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: oids } } });
  await db.order.deleteMany({ where: { id: { in: oids } } });
  await db.wallet.deleteMany({ where: { userId } });
  await db.driver.deleteMany({ where: { id: driverId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: { in: [userId, actorId] } } });
});

/** An order with `count` packed shipments, each assigned and dispatched. Returns ids and codes. */
async function dispatchedOrder(count: number) {
  const order = await db.order.create({
    data: {
      orderNo: `ZZZROLL-${tag}-${n++}`, userId, status: "confirmed", subtotalPaise: 10000, totalPaise: 10000,
      paymentMethod: "razorpay", warehouseId,
      address: { name: "Bilal", phone: "+919800000000", line1: "12 Link Road", city: "Srinagar", pincode: "190005" },
    },
  });
  const ships: { id: string; code: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const s = await db.shipment.create({ data: { orderId: order.id, sequence: i, speedClass: "express", status: "packed", warehouseId } });
    assert.equal((await assignShipment({ shipmentId: s.id, driverId, actor: actor() })).ok, true);
    assert.equal((await advanceShipment({ shipmentId: s.id, to: "out_for_delivery", actor: actor() })).ok, true);
    const code = (await db.shipment.findUniqueOrThrow({ where: { id: s.id } })).deliveryCode!;
    ships.push({ id: s.id, code });
  }
  return { orderId: order.id, ships };
}
const status = async (orderId: string) => (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status;
const events = (orderId: string) => db.orderStatusEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

test("target and steps: pure rules", () => {
  assert.equal(targetFromShipments(["delivered"]), "delivered");
  assert.equal(targetFromShipments(["delivered", "out_for_delivery"]), "out_for_delivery");
  assert.equal(targetFromShipments(["delivered", "pending"]), "out_for_delivery");
  assert.equal(targetFromShipments(["delivered", "cancelled"]), "delivered");
  assert.equal(targetFromShipments(["cancelled"]), null);
  assert.equal(targetFromShipments(["packed", "packed"]), "packed");
  assert.equal(targetFromShipments(["packed", "pending"]), "confirmed");
  assert.deepEqual(forwardSteps("confirmed", "delivered"), ["packed", "out_for_delivery", "delivered"]);
  assert.deepEqual(forwardSteps("delivered", "out_for_delivery"), [], "never backwards");
  assert.deepEqual(forwardSteps("cancelled", "delivered"), [], "never out of a terminal state");
  assert.deepEqual(forwardSteps("pending_payment", "delivered"), [], "never an unpaid order");
});

test("single shipment, code-confirmed: order walks to delivered with one event per step", async () => {
  const { orderId, ships } = await dispatchedOrder(1);
  assert.equal(await status(orderId), "out_for_delivery", "dispatch already moved the order on");
  assert.equal((await confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() })).ok, true);
  assert.equal(await status(orderId), "delivered");
  const ev = (await events(orderId)).map((e) => `${e.fromStatus}>${e.toStatus}`);
  assert.deepEqual(ev, ["confirmed>packed", "packed>out_for_delivery", "out_for_delivery>delivered"]);
  assert.ok((await db.order.findUniqueOrThrow({ where: { id: orderId } })).deliveredAt);
});

test("multi-shipment: delivered only when every shipment is delivered", async () => {
  const { orderId, ships } = await dispatchedOrder(2);
  await confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() });
  assert.equal(await status(orderId), "out_for_delivery", "one of two delivered is not delivered");
  await confirmDelivery({ shipmentId: ships[1].id, code: ships[1].code, actor: actor() });
  assert.equal(await status(orderId), "delivered");
});

test("a cancelled shipment does not hold the order back; the rest delivered → delivered", async () => {
  const { orderId, ships } = await dispatchedOrder(2);
  assert.equal((await advanceShipment({ shipmentId: ships[1].id, to: "cancelled", actor: actor() })).ok, true);
  await confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() });
  assert.equal(await status(orderId), "delivered");
});

test("no-code exception follows the same rule", async () => {
  const { orderId, ships } = await dispatchedOrder(1);
  const r = await advanceShipment({ shipmentId: ships[0].id, to: "delivered", actor: actor(), overrideReason: "Customer away, neighbour received" });
  assert.equal(r.ok, true);
  assert.equal(await status(orderId), "delivered");
});

test("repeated and concurrent confirmations: one delivery, one set of events", async () => {
  const { orderId, ships } = await dispatchedOrder(2);
  const results = await Promise.all([
    confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() }),
    confirmDelivery({ shipmentId: ships[1].id, code: ships[1].code, actor: actor() }),
    confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 2, "each shipment delivered exactly once");
  assert.equal(await status(orderId), "delivered");
  const toDelivered = (await events(orderId)).filter((e) => e.toStatus === "delivered");
  assert.equal(toDelivered.length, 1, "the order became delivered exactly once");
  assert.equal((await confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() })).ok, false);
});

test("cancel racing the last delivery: never both; stock untouched by delivery", async () => {
  const { orderId, ships } = await dispatchedOrder(1);
  const [cancel, deliver] = await Promise.allSettled([
    advanceOrderStatus(actorId, orderId, "cancelled"),
    confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() }),
  ]);
  const final = await status(orderId);
  /* Goods are on the road, so a cancel must refuse (SHIPMENT_DISPATCHED) or lose; the delivery stands. */
  assert.equal(cancel.status, "rejected");
  assert.equal(deliver.status === "fulfilled" && deliver.value.ok, true);
  assert.equal(final, "delivered");
  const released = await db.auditLog.count({ where: { entityId: orderId, action: "inventory.released" } });
  assert.equal(released, 0, "no stock was released");
});

test("cashback failure after commit never undoes the delivery; retry credits exactly once", async (t) => {
  const prior = await db.setting.findUnique({ where: { key: "cashback.percent" } });
  await db.setting.upsert({ where: { key: "cashback.percent" }, create: { key: "cashback.percent", value: "2" }, update: { value: "2" } });
  t.after(async () => {
    if (prior) await db.setting.update({ where: { key: "cashback.percent" }, data: { value: prior.value } });
    else await db.setting.deleteMany({ where: { key: "cashback.percent" } });
  });
  const { orderId, ships } = await dispatchedOrder(1);
  await confirmDelivery({ shipmentId: ships[0].id, code: ships[0].code, actor: actor() });
  const result = { orderId, from: "out_for_delivery" as const, to: "delivered" as const };
  await afterOrderRollup(result, { credit: async () => { throw new Error("wallet down"); }, notify: async () => ({ sent: false }) });
  assert.equal(await status(orderId), "delivered", "delivery stands");
  await afterOrderRollup(result, { notify: async () => ({ sent: false }) });
  await afterOrderRollup(result, { notify: async () => ({ sent: false }) });
  const credits = await db.walletTransaction.count({ where: { referenceId: orderId, type: "cashback_credit" } });
  assert.equal(credits, 1, "one failed attempt + two retries = exactly one credit");
  const pending = await db.auditLog.count({ where: { entityId: orderId, action: "order.notification_pending" } });
  assert.ok(pending >= 1, "notification recorded as pending integration, not sent");
  assert.equal(await db.auditLog.count({ where: { entityId: orderId, action: "order.notification_sent" } }), 0);
});
