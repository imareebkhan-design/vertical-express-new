import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { refundEligibility, requestRefund } from "../refunds";
import { settleCapturedPayment, listCapturedPaymentsOnDeadOrders } from "../checkout";

/**
 * A refund is final. Replaying the capture evidence that preceded it — the
 * client callback again, or a webhook redelivered under a new event id — must
 * not put the payment back to `captured`, write another "payment received after
 * expiry" event, raise the late-payment alert again or return the payment to
 * the refund worklist. A genuinely different capture on the same order is still
 * money that arrived and is recorded. (Audit F1, 31 Oct 2026.)
 */

let userId: string;
const orders: string[] = [];
const payments: string[] = [];
before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID(), firebaseUid: `refund-replay-${randomUUID()}` } })).id;
});
after(async () => {
  await db.paymentRefund.deleteMany({ where: { orderId: { in: orders } } });
  await db.auditLog.deleteMany({ where: { entityType: "payment", entityId: { in: payments } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orders } } });
  await db.payment.deleteMany({ where: { orderId: { in: orders } } });
  await db.order.deleteMany({ where: { id: { in: orders } } });
  await db.user.delete({ where: { id: userId } });
});

async function fixture() {
  const order = await db.order.create({ data: {
    orderNo: `REPLAY-${randomUUID()}`, userId, address: {}, status: "cancelled",
    paymentMethod: "razorpay", subtotalPaise: 19900, totalPaise: 19900,
  } });
  orders.push(order.id);
  const payment = await db.payment.create({ data: {
    orderId: order.id, gateway: "razorpay", gatewayOrderId: `order_${randomUUID()}`,
    gatewayPaymentId: `pay_${randomUUID()}`, amountPaise: 19900, status: "captured", signatureVerified: true,
  } });
  payments.push(payment.id);
  const params = { paymentId: payment.id, orderId: order.id, orderNo: order.orderNo,
    amountPaise: 19900, gatewayPaymentId: payment.gatewayPaymentId };
  return { order, payment, params };
}

/** A fake gateway that counts how often money was actually sent back. */
function fakeGateway() {
  const gateway = { calls: 0, provider: { refundPayment: async () => {
    gateway.calls += 1;
    return { refundId: `rfnd_${randomUUID()}`, status: "processed" as const };
  } } };
  return gateway;
}
async function refund(paymentId: string, gateway = fakeGateway()) {
  return requestRefund({ paymentId, reason: "Synthetic cancelled order refund", actorEmail: "ops@example.test" }, {
    provider: gateway.provider,
  });
}

/** Lines the observability layer wrote that mention the late-payment alert. */
function lateAlerts(t: { mock: { method: typeof test.mock.method } }) {
  const lines: string[] = [];
  for (const m of ["log", "error", "warn"] as const) {
    t.mock.method(console, m, (...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
  }
  return () => lines.filter((l) => l.includes("late_payment_captured")).length;
}

test("refunded capture stays refunded on client and new webhook event replays", async (t) => {
  const { order, payment, params } = await fixture();
  const gateway = fakeGateway();
  assert.equal((await refund(payment.id, gateway)).ok, true);
  assert.equal(gateway.calls, 1);
  const beforeEvents = await db.orderStatusEvent.count({ where: { orderId: order.id } });

  const alerts = lateAlerts(t);
  const outcomes = [];
  for (const source of ["client", "webhook"] as const) {
    outcomes.push(await settleCapturedPayment({ ...params, source, eventId: `evt_${randomUUID()}` }));
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "refunded");
  }

  assert.deepEqual(outcomes, ["late_already_recorded", "late_already_recorded"]);
  assert.equal(alerts(), 0, "no second late-payment alert");
  assert.equal(await db.orderStatusEvent.count({ where: { orderId: order.id } }), beforeEvents);
  assert.equal((await listCapturedPaymentsOnDeadOrders()).some((p) => p.id === payment.id), false, "not back on the worklist");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, "cancelled");
  assert.equal(await db.paymentRefund.count({ where: { paymentId: payment.id } }), 1);
  const eligibility = await refundEligibility(db, payment.id);
  assert.equal(eligibility.ok ? "eligible" : eligibility.code, "ALREADY_REFUNDED");
  assert.equal(gateway.calls, 1, "no further money sent back");
});

test("a new capture after a refund is recorded once; its refunded replay is not another capture", async () => {
  const { order, payment, params } = await fixture();
  await refund(payment.id);
  const eventsBefore = await db.orderStatusEvent.count({ where: { orderId: order.id } });

  const secondId = `pay_${randomUUID()}`;
  const second = { ...params, gatewayPaymentId: secondId, source: "webhook" as const };
  const outcomes = await Promise.all([settleCapturedPayment(second), settleCapturedPayment(second)]);
  assert.deepEqual([...outcomes].sort(), ["late_already_recorded", "late_recorded"], "recorded exactly once");
  assert.equal(await db.orderStatusEvent.count({ where: { orderId: order.id } }), eventsBefore + 1);

  let rows = await db.payment.findMany({ where: { orderId: order.id } });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((p) => p.id === payment.id)?.status, "refunded");
  const duplicate = rows.find((p) => p.gatewayPaymentId === secondId)!;
  payments.push(duplicate.id);
  assert.equal(duplicate.status, "captured");
  assert.ok((await listCapturedPaymentsOnDeadOrders()).some((p) => p.id === duplicate.id), "the new money is owed back");

  assert.equal((await refund(duplicate.id)).ok, true);
  assert.equal(await settleCapturedPayment(second), "late_already_recorded");
  rows = await db.payment.findMany({ where: { orderId: order.id } });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((p) => p.status === "refunded"));
  assert.equal(await db.orderStatusEvent.count({ where: { orderId: order.id } }), eventsBefore + 1);
});

test("concurrent refund completion and capture replay preserve the final refund", async () => {
  const { order, payment, params } = await fixture();
  const gateway = fakeGateway();
  await Promise.all([refund(payment.id, gateway), settleCapturedPayment({ ...params, source: "client" })]);
  assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, "refunded");
  assert.equal(gateway.calls, 1);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, "cancelled");
});
