import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { cancelOrder, cleanupExpiredPendingOrders } from "../orders";
import { advanceOrderStatus } from "../admin/manage";
import { advanceShipment } from "../admin/shipments-write";
import { getDispatchBoard } from "../shipments";

/**
 * A cancelled order takes its shipments with it (11 Oct 2026, staging).
 *
 * No order-cancel path touched shipments. Five cancelled orders on staging
 * still had `pending` shipments: each sat on the dispatch board as work to
 * pack, the app said "Being prepared" under "Cancelled", and cancelling one
 * of those shipments by hand would have released the order's stock a second
 * time.
 */

const USER = randomUUID();
const ADMIN = randomUUID();
const TAG = `CCS${Date.now() % 1_000_000}`;
const ADDRESS = { label: "site", name: "Cancel Ships", phone: "9876543210", line1: "Plot 1", line2: null, landmark: null, city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" };

async function orderWithShipment(
  suffix: string,
  opts: { status?: "pending_payment" | "confirmed" | "cancelled"; placedAt?: Date; paymentMethod?: "razorpay" | "cod"; shipment?: "pending" | "packed" } = {}
) {
  return db.order.create({
    data: {
      orderNo: `${TAG}-${suffix}`, userId: USER, address: ADDRESS, status: opts.status ?? "pending_payment",
      paymentMethod: opts.paymentMethod ?? "razorpay", subtotalPaise: 10000, totalPaise: 10000,
      ...(opts.placedAt ? { placedAt: opts.placedAt } : {}),
      shipments: { create: [{ sequence: 1, speedClass: "express", status: opts.shipment ?? "pending" }] },
    },
    include: { shipments: true },
  });
}
const shipmentStatus = async (orderId: string) =>
  (await db.shipment.findFirstOrThrow({ where: { orderId } })).status;
const onBoard = async (shipmentId: string) => {
  const b = await getDispatchBoard();
  return [...b.express, ...b.scheduled].some((s) => s.id === shipmentId);
};

before(async () => {
  await db.user.createMany({ data: [
    { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
    { id: ADMIN, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
  ] });
});

after(async () => {
  await db.auditLog.deleteMany({ where: { actorId: ADMIN } });
  await db.orderStatusEvent.deleteMany({ where: { order: { userId: USER } } });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.user.deleteMany({ where: { id: { in: [USER, ADMIN] } } });
});

test("a customer cancel cancels the shipment and takes it off the board", async () => {
  const o = await orderWithShipment("CUST", { status: "confirmed", paymentMethod: "cod" });
  assert.equal(await onBoard(o.shipments[0].id), true, "a confirmed COD order is work");
  await cancelOrder(USER, o.orderNo, "changed my mind");
  assert.equal(await shipmentStatus(o.id), "cancelled");
  assert.equal(await onBoard(o.shipments[0].id), false);
});

test("the expiry cron cancels the shipment too", async () => {
  const o = await orderWithShipment("CRON", { placedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) });
  await cleanupExpiredPendingOrders(2 * 24 * 60);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "cancelled");
  assert.equal(await shipmentStatus(o.id), "cancelled");
});

test("an admin cancel cancels a packed shipment too", async () => {
  const o = await orderWithShipment("ADMIN", { status: "confirmed", paymentMethod: "cod", shipment: "packed" });
  await advanceOrderStatus(ADMIN, o.id, "cancelled");
  assert.equal(await shipmentStatus(o.id), "cancelled");
});

test("an unpaid order's shipment is not on the board", async () => {
  const o = await orderWithShipment("UNPAID");
  assert.equal(await onBoard(o.shipments[0].id), false, "nothing is packed before the payment is");
});

test("a shipment left open on a dead order cannot be moved — no second stock release", async () => {
  /* The rows already on staging before the fix: order cancelled, shipment pending. */
  const o = await orderWithShipment("LEGACY", { status: "cancelled" });
  assert.equal(await onBoard(o.shipments[0].id), false);
  for (const to of ["cancelled", "packed"] as const) {
    const res = await advanceShipment({ shipmentId: o.shipments[0].id, to, actor: { id: ADMIN, email: "ops@test" } });
    assert.equal(res.ok === false && res.reason, "order_not_active", `refuses ${to}`);
  }
  assert.equal(await shipmentStatus(o.id), "pending", "nothing written");
});

test("an unpaid order's shipment cannot be packed", async () => {
  const o = await orderWithShipment("UNPAID-PACK");
  const res = await advanceShipment({ shipmentId: o.shipments[0].id, to: "packed", actor: { id: ADMIN, email: "ops@test" } });
  assert.equal(res.ok === false && res.reason, "order_not_active");
});
