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

/* ------------------------------------------------- a failed delivery can end
 *
 * Before 13 Nov 2026 a paid order whose delivery failed was a dead end: the
 * shipment could come back, but the order stayed packed / out_for_delivery,
 * could not be cancelled, and so its payment was never owed back
 * (refundEligibility: NOT_OWED). An operator may now cancel it once no goods
 * are outside the warehouse.
 */
test("failed delivery: once received back, an operator can cancel the order; the shipment closes and the payment becomes refundable", async () => {
  const { advanceOrderStatus } = await import("@/lib/services/admin/manage");
  const { refundEligibility } = await import("@/lib/services/refunds");
  const { orderId, ships: [sid] } = await dispatchedOrder(1);
  const payment = await db.payment.findFirstOrThrow({ where: { orderId } });

  assert.deepEqual(await refundEligibility(db, payment.id), { ok: false, code: "NOT_OWED" }, "nothing is owed while the order is alive");
  await assert.rejects(advanceOrderStatus(actorId, orderId, "cancelled"), /SHIPMENT_DISPATCHED/, "not while the goods are on a vehicle");
  assert.equal((await orderOf(orderId)).status, "out_for_delivery", "the refused cancel changed nothing");
  assert.equal((await shipmentOf(sid)).status, "out_for_delivery");

  assert.equal((await receiveShipmentBack({ shipmentId: sid, actor: actor(), reason: REASON, goodsReceivedBack: true })).ok, true);
  await advanceOrderStatus(actorId, orderId, "cancelled");

  assert.equal((await orderOf(orderId)).status, "cancelled");
  assert.equal((await shipmentOf(sid)).status, "cancelled", "nothing is left on the dispatch board");
  const ev = (await db.orderStatusEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } })).at(-1)!;
  assert.deepEqual([ev.fromStatus, ev.toStatus], ["packed", "cancelled"]);
  assert.match(ev.note ?? "", /refund required/);
  assert.deepEqual(await refundEligibility(db, payment.id), { ok: true, basis: "dead_order", remainingPaise: 19900 });
  assert.deepEqual((await db.payment.findMany({ where: { orderId } })).map((p) => p.status), ["captured"], "cancelling does not itself move money");
});

test("failed delivery: an order whose only shipment was cancelled on the board can be cancelled too", async () => {
  const { advanceOrderStatus } = await import("@/lib/services/admin/manage");
  const { orderId, ships: [sid] } = await dispatchedOrder(1);
  assert.equal((await receiveShipmentBack({ shipmentId: sid, actor: actor(), reason: REASON, goodsReceivedBack: true })).ok, true);
  assert.equal((await advanceShipment({ shipmentId: sid, to: "cancelled", actor: actor() })).ok, true);
  assert.equal((await orderOf(orderId)).status, "packed", "the order does not follow a cancelled shipment by itself");
  await advanceOrderStatus(actorId, orderId, "cancelled");
  assert.equal((await orderOf(orderId)).status, "cancelled");
});

test("a part-delivered order is never cancelled whole", async () => {
  const { advanceOrderStatus } = await import("@/lib/services/admin/manage");
  const { orderId, ships: [a, b] } = await dispatchedOrder(2);
  const code = (await shipmentOf(a)).deliveryCode!;
  assert.equal((await confirmDelivery({ shipmentId: a, code, actor: actor() })).ok, true);
  assert.equal((await receiveShipmentBack({ shipmentId: b, actor: actor(), reason: REASON, goodsReceivedBack: true })).ok, true);
  const before = (await orderOf(orderId)).status;
  await assert.rejects(advanceOrderStatus(actorId, orderId, "cancelled"), /SHIPMENT_DISPATCHED/);
  assert.equal((await orderOf(orderId)).status, before);
  assert.equal((await shipmentOf(b)).status, "packed");
});

test("the recovery is an operator's, not the customer's, and offers nothing while goods are out", async () => {
  const { manualOrderMoves, isCancellable, canOperatorCancel } = await import("@/lib/order-flow");
  assert.equal(isCancellable("packed"), false, "a customer still cannot cancel after packing");
  assert.equal(isCancellable("out_for_delivery"), false);
  assert.deepEqual(manualOrderMoves("out_for_delivery", true, true), []);
  assert.deepEqual(manualOrderMoves("out_for_delivery", true), [], "unknown is treated as out");
  assert.deepEqual(manualOrderMoves("packed", true, false), ["cancelled"]);
  assert.deepEqual(manualOrderMoves("out_for_delivery", false, false), ["delivered", "cancelled"]);
  assert.equal(canOperatorCancel("delivered", false), false);
  assert.equal(canOperatorCancel("cancelled", false), false);
});
