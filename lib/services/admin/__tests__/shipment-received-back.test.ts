import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { assignShipment, advanceShipment, confirmDelivery, receiveShipmentBack } from "@/lib/services/admin/shipments-write";
import { createDriver } from "@/lib/services/admin/roster-write";

/**
 * A shipment that left on a vehicle but was never handed over — dispatched by
 * mistake, or the customer was not there — comes back to the warehouse. That
 * is a physical event with a person accountable for it, so it is its own
 * audited operation, not a rewind of the state machine:
 *
 *   - only from out_for_delivery, only for an active order, only by an operator
 *     who attests the goods are back and says why;
 *   - the delivery code is revoked (it proved nothing, and must not prove a
 *     later handover), the live position is removed;
 *   - no stock moves (dispatch never released stock), no payment is touched,
 *     no cashback, and nothing claims a delivery;
 *   - the order follows its shipments back only as far as they justify, with
 *     its own recorded event — the forward-only roll-up is unchanged.
 */
const tag = randomUUID().slice(0, 8);
let userId = "";
let actorId = "";
let warehouseId = "";
let driverId = "";
const actor = () => ({ id: actorId, email: "zzz-back@demo.invalid" });
let n = 0;
const REASON = "Dispatched by mistake; driver confirmed it never left the store";

before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  actorId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ BACK ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  const d = await createDriver({ name: `ZZZ Back ${tag}`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, actor: actor() });
  driverId = d.ok ? d.id : "";
});

after(async () => {
  const orders = await db.order.findMany({ where: { orderNo: { startsWith: `ZZZBACK-${tag}` } }, select: { id: true } });
  const oids = orders.map((o) => o.id);
  const sids = (await db.shipment.findMany({ where: { orderId: { in: oids } }, select: { id: true } })).map((s) => s.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: [...oids, ...sids, driverId] } } });
  await db.walletTransaction.deleteMany({ where: { referenceId: { in: oids } } });
  await db.shipmentLiveLocation.deleteMany({ where: { shipmentId: { in: sids } } });
  await db.payment.deleteMany({ where: { orderId: { in: oids } } });
  await db.shipment.deleteMany({ where: { id: { in: sids } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: oids } } });
  await db.order.deleteMany({ where: { id: { in: oids } } });
  await db.wallet.deleteMany({ where: { userId } });
  await db.driver.deleteMany({ where: { id: driverId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: { in: [userId, actorId] } } });
});

/** A paid order with `count` shipments, each assigned and dispatched (order rolls up to out_for_delivery). */
async function dispatchedOrder(count: number) {
  const order = await db.order.create({
    data: {
      orderNo: `ZZZBACK-${tag}-${n++}`, userId, status: "confirmed", subtotalPaise: 19900, totalPaise: 19900,
      paymentMethod: "razorpay", warehouseId,
      address: { name: "QA", phone: "+919000000000", line1: "QA", city: "Srinagar", pincode: "190011" },
    },
  });
  await db.payment.create({ data: { orderId: order.id, gateway: "razorpay", amountPaise: 19900, status: "captured", gatewayPaymentId: `pay_zzz_${tag}_${n}` } });
  const ships: string[] = [];
  for (let i = 1; i <= count; i++) {
    const s = await db.shipment.create({ data: { orderId: order.id, sequence: i, speedClass: "express", status: "packed", warehouseId } });
    assert.equal((await assignShipment({ shipmentId: s.id, driverId, actor: actor() })).ok, true);
    assert.equal((await advanceShipment({ shipmentId: s.id, to: "out_for_delivery", actor: actor() })).ok, true);
    await db.shipmentLiveLocation.create({
      data: { shipmentId: s.id, driverId, latitude: 28.67, longitude: 77.22, recordedAt: new Date(), receivedAt: new Date() },
    });
    ships.push(s.id);
  }
  return { orderId: order.id, ships };
}
const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } });
const shipmentOf = (id: string) => db.shipment.findUniqueOrThrow({ where: { id } });

test("received back: shipment packed, code revoked, live position gone, order back to packed with its own event; stock, payment and wallet untouched", async () => {
  const { orderId, ships: [sid] } = await dispatchedOrder(1);
  assert.equal((await orderOf(orderId)).status, "out_for_delivery");
  const before = await shipmentOf(sid);
  assert.ok(before.deliveryCode && before.dispatchedAt);

  const r = await receiveShipmentBack({ shipmentId: sid, actor: actor(), reason: REASON, goodsReceivedBack: true });
  assert.deepEqual(r, { ok: true, orderStatus: "packed" });

  const s = await shipmentOf(sid);
  assert.equal(s.status, "packed");
  assert.equal(s.deliveryCode, null, "the code is revoked");
  assert.equal(s.dispatchedAt, null);
  assert.equal(s.deliveredAt, null, "nothing claims a delivery");
  assert.equal(s.driverId, driverId, "the assignment stays; ops may reassign");
  assert.equal(await db.shipmentLiveLocation.count({ where: { shipmentId: sid } }), 0);

  assert.equal((await orderOf(orderId)).status, "packed");
  const ev = await db.orderStatusEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  const last = ev.at(-1)!;
  assert.deepEqual([last.fromStatus, last.toStatus], ["out_for_delivery", "packed"]);
  assert.match(last.note ?? "", /returned to the warehouse — not handed over/);
  assert.equal(ev.filter((e) => e.toStatus === "out_for_delivery").length, 1, "history is appended to, never rewritten");

  const audits = await db.auditLog.findMany({ where: { entityId: { in: [sid, orderId] } }, orderBy: { createdAt: "asc" } });
  const back = audits.find((a) => a.action === "shipment.received_back");
  assert.ok(back, "audited");
  assert.equal((back!.after as { reason?: string }).reason, REASON);
  assert.equal(JSON.stringify(back).includes(before.deliveryCode!), false, "the code itself is never written to the trail");
  assert.ok(audits.find((a) => a.action === "order.status_corrected"));
  assert.equal(audits.filter((a) => a.action.startsWith("inventory.")).length, 0, "no stock movement");

  const pays = await db.payment.findMany({ where: { orderId } });
  assert.deepEqual(pays.map((p) => p.status), ["captured"], "the captured payment is untouched");
  assert.equal(await db.walletTransaction.count({ where: { referenceId: orderId } }), 0);
});

test("the revoked code cannot confirm a delivery; a fresh dispatch issues a new code and the order rolls forward again", async () => {
  const { orderId, ships: [sid] } = await dispatchedOrder(1);
  const old = (await shipmentOf(sid)).deliveryCode!;
  assert.equal((await receiveShipmentBack({ shipmentId: sid, actor: actor(), reason: REASON, goodsReceivedBack: true })).ok, true);

  const late = await confirmDelivery({ shipmentId: sid, code: old, actor: actor() });
  assert.equal(late.ok, false);
  assert.equal((await shipmentOf(sid)).status, "packed");

  assert.equal((await advanceShipment({ shipmentId: sid, to: "out_for_delivery", actor: actor() })).ok, true);
  const fresh = (await shipmentOf(sid)).deliveryCode!;
  assert.ok(fresh);
  assert.equal((await orderOf(orderId)).status, "out_for_delivery");
});

test("refused without the operator's attestation and a reason", async () => {
  const { ships: [sid] } = await dispatchedOrder(1);
  assert.deepEqual(await receiveShipmentBack({ shipmentId: sid, actor: actor(), reason: REASON, goodsReceivedBack: false }), { ok: false, reason: "attestation_required" });
  assert.deepEqual(await receiveShipmentBack({ shipmentId: sid, actor: actor(), reason: "oops", goodsReceivedBack: true }), { ok: false, reason: "reason_required" });
  assert.equal((await shipmentOf(sid)).status, "out_for_delivery");
});

test("refused once delivered, for a shipment still in the warehouse, and for a closed order", async () => {
  const a = await dispatchedOrder(1);
  const code = (await shipmentOf(a.ships[0])).deliveryCode!;
  assert.equal((await confirmDelivery({ shipmentId: a.ships[0], code, actor: actor() })).ok, true);
  assert.deepEqual(await receiveShipmentBack({ shipmentId: a.ships[0], actor: actor(), reason: REASON, goodsReceivedBack: true }), { ok: false, reason: "not_out_for_delivery" });
  assert.equal((await shipmentOf(a.ships[0])).status, "delivered");

  const b = await dispatchedOrder(1);
  assert.equal((await receiveShipmentBack({ shipmentId: b.ships[0], actor: actor(), reason: REASON, goodsReceivedBack: true })).ok, true);
  assert.deepEqual(await receiveShipmentBack({ shipmentId: b.ships[0], actor: actor(), reason: REASON, goodsReceivedBack: true }), { ok: false, reason: "not_out_for_delivery" }, "not twice");

  const c = await dispatchedOrder(1);
  await db.order.update({ where: { id: c.orderId }, data: { status: "cancelled" } });
  assert.deepEqual(await receiveShipmentBack({ shipmentId: c.ships[0], actor: actor(), reason: REASON, goodsReceivedBack: true }), { ok: false, reason: "order_not_active" });
});

test("two shipments, one still on the road: only the returned one moves; the order stays out for delivery", async () => {
  const { orderId, ships: [s1, s2] } = await dispatchedOrder(2);
  const r = await receiveShipmentBack({ shipmentId: s1, actor: actor(), reason: REASON, goodsReceivedBack: true });
  assert.deepEqual(r, { ok: true, orderStatus: "out_for_delivery" });
  assert.equal((await shipmentOf(s1)).status, "packed");
  assert.equal((await shipmentOf(s2)).status, "out_for_delivery");
  assert.equal((await orderOf(orderId)).status, "out_for_delivery");
  assert.equal(await db.auditLog.count({ where: { entityId: orderId, action: "order.status_corrected" } }), 0);
});
