import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { settleCapturedPayment } from "../checkout";
import { deliverOrderEmails, enqueueOrderConfirmation, type OrderEmailSender } from "../order-emails";

/**
 * Order-confirmation email (audit F2, 31 Oct 2026). It used to be sent only by
 * the web checkout action, after the callback: a mobile order, a webhook-only
 * payment or a browser closed before the callback got none, and a replayed web
 * callback could send a second one.
 *
 * Now the one pending→confirmed transition queues one row per order inside the
 * money transaction, and the scheduler delivers it later with a lease, bounded
 * retries and an explicit state. Network delivery is not exactly-once: an
 * unknown outcome is retried with the same provider idempotency key.
 */

let userId: string;
const orders: string[] = [];
const FROM = "Vertical Express <orders@example.test>";

before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID(), email: `buyer-${randomUUID().slice(0, 8)}@example.test` } })).id;
});
after(async () => {
  await db.orderEmail.deleteMany({ where: { orderId: { in: orders } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orders } } });
  await db.payment.deleteMany({ where: { orderId: { in: orders } } });
  await db.order.deleteMany({ where: { id: { in: orders } } });
  await db.user.delete({ where: { id: userId } });
});

/** A Razorpay order awaiting payment, as checkout leaves it. */
async function pendingOrder(o: { email?: string | null; accountless?: boolean } = {}) {
  const owner = o.accountless ? (await db.user.create({ data: { id: randomUUID() } })).id : userId;
  const order = await db.order.create({ data: {
    orderNo: `MAIL-${randomUUID().slice(0, 12)}`, userId: owner, status: "pending_payment", paymentMethod: "razorpay",
    address: { name: "Mail Buyer", ...(o.email ? { email: o.email } : {}) }, subtotalPaise: 19900, totalPaise: 19900,
  } });
  orders.push(order.id);
  const payment = await db.payment.create({ data: {
    orderId: order.id, gateway: "razorpay", gatewayOrderId: `order_${randomUUID()}`, amountPaise: 19900, status: "created",
  } });
  const capture = { paymentId: payment.id, orderId: order.id, orderNo: order.orderNo, amountPaise: 19900, gatewayPaymentId: `pay_${randomUUID()}` };
  return { order, payment, capture };
}
const rows = (orderId: string) => db.orderEmail.findMany({ where: { orderId } });

/** A fake provider: records every call; `fail` decides each attempt. */
function fakeSender(fail: (n: number) => "ok" | "error" | "throw" = () => "ok") {
  const calls: Parameters<OrderEmailSender>[0][] = [];
  const send: OrderEmailSender = async (m) => {
    calls.push(m);
    const r = fail(calls.length);
    if (r === "throw") throw new Error("timeout");
    return r === "ok";
  };
  return { calls, send };
}
/** Deliver only this test's rows: other suites may leave queued rows behind. */
async function deliverMine(orderId: string, send: OrderEmailSender, now = new Date()) {
  const others = await db.orderEmail.findMany({ where: { orderId: { not: orderId }, state: { in: ["queued", "sending"] } }, select: { id: true, availableAt: true } });
  const far = new Date(now.getTime() + 365 * 86_400_000);
  await db.orderEmail.updateMany({ where: { id: { in: others.map((r) => r.id) } }, data: { availableAt: far, state: "queued", leaseUntil: null } });
  try {
    return await deliverOrderEmails({ send, from: FROM, now, limit: 5 });
  } finally {
    for (const r of others) await db.orderEmail.update({ where: { id: r.id }, data: { availableAt: r.availableAt } });
  }
}

test("callback first, then the webhook, then a replayed callback: one queued confirmation", async () => {
  const { order, capture } = await pendingOrder({ email: "Site.Owner@Example.test " });
  assert.equal(await settleCapturedPayment({ ...capture, source: "client" }), "confirmed");
  assert.equal(await settleCapturedPayment({ ...capture, source: "webhook", eventId: `evt_${randomUUID()}` }), "already_confirmed");
  assert.equal(await settleCapturedPayment({ ...capture, source: "client" }), "already_confirmed");
  const r = await rows(order.id);
  assert.equal(r.length, 1);
  assert.equal(r[0].state, "queued");
  assert.equal(r[0].recipient, "site.owner@example.test", "the checkout contact email, normalised");
  assert.match(r[0].subject, new RegExp(order.orderNo));
});

test("webhook first (browser closed, callback lost): the confirmation is still queued", async () => {
  const { order, capture } = await pendingOrder();
  assert.equal(await settleCapturedPayment({ ...capture, source: "webhook", eventId: `evt_${randomUUID()}` }), "confirmed");
  const r = await rows(order.id);
  assert.equal(r.length, 1);
  assert.equal(r[0].recipient, (await db.user.findUniqueOrThrow({ where: { id: userId } })).email, "falls back to the account email");
});

test("callback and webhook racing confirm once and queue once", async () => {
  const { order, capture } = await pendingOrder({ email: "race@example.test" });
  const outcomes = await Promise.all([
    settleCapturedPayment({ ...capture, source: "client" }),
    settleCapturedPayment({ ...capture, source: "webhook", eventId: `evt_${randomUUID()}` }),
  ]);
  assert.deepEqual([...outcomes].sort(), ["already_confirmed", "confirmed"]);
  assert.equal((await rows(order.id)).length, 1);
});

test("a phone-only customer with no email still orders; the confirmation is recorded as skipped, never sent", async () => {
  const { order, capture } = await pendingOrder({ accountless: true });
  assert.equal(await settleCapturedPayment({ ...capture, source: "client" }), "confirmed");
  const [r] = await rows(order.id);
  assert.deepEqual([r.state, r.recipient, r.lastError], ["skipped", null, "no_recipient"]);
  const sender = fakeSender();
  await deliverMine(order.id, sender.send);
  assert.equal(sender.calls.length, 0);
  await db.orderEmail.deleteMany({ where: { orderId: order.id } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: order.id } });
  await db.payment.deleteMany({ where: { orderId: order.id } });
  await db.order.delete({ where: { id: order.id } });
  orders.splice(orders.indexOf(order.id), 1);
  await db.user.delete({ where: { id: order.userId } });
});

test("delivered once; a second scheduler run sends nothing more", async () => {
  const { order, capture } = await pendingOrder({ email: "once@example.test" });
  await settleCapturedPayment({ ...capture, source: "client" });
  const sender = fakeSender();
  await deliverMine(order.id, sender.send);
  await deliverMine(order.id, sender.send);
  assert.equal(sender.calls.length, 1);
  assert.equal(sender.calls[0].to, "once@example.test");
  assert.equal(sender.calls[0].from, FROM);
  const [r] = await rows(order.id);
  assert.equal(r.state, "sent");
  assert.ok(r.sentAt);
});

test("two scheduler runs at once send it once (row lease)", async () => {
  const { order, capture } = await pendingOrder({ email: "lease@example.test" });
  await settleCapturedPayment({ ...capture, source: "client" });
  const sender = fakeSender();
  const now = new Date();
  await Promise.all([deliverOrderEmails({ send: sender.send, from: FROM, now, limit: 5 }), deliverOrderEmails({ send: sender.send, from: FROM, now, limit: 5 })]);
  assert.equal(sender.calls.filter((c) => c.to === "lease@example.test").length, 1);
  assert.equal((await rows(order.id))[0].state, "sent");
});

test("a provider error or timeout is retried later with the same idempotency key, and the order stays confirmed", async () => {
  const { order, capture } = await pendingOrder({ email: "retry@example.test" });
  await settleCapturedPayment({ ...capture, source: "client" });
  const sender = fakeSender((n) => (n === 1 ? "throw" : n === 2 ? "error" : "ok"));
  const t0 = new Date();

  await deliverMine(order.id, sender.send, t0);
  let [r] = await rows(order.id);
  assert.deepEqual([r.state, r.attempts, r.lastError], ["queued", 1, "provider_failed_or_outcome_unknown"]);
  assert.ok(r.availableAt > t0, "backed off");
  await deliverMine(order.id, sender.send, t0);
  assert.equal(sender.calls.length, 1, "not retried before its time");

  await deliverMine(order.id, sender.send, new Date(r.availableAt.getTime() + 1));
  [r] = await rows(order.id);
  assert.deepEqual([r.state, r.attempts], ["queued", 2]);
  await deliverMine(order.id, sender.send, new Date(r.availableAt.getTime() + 1));
  [r] = await rows(order.id);
  assert.equal(r.state, "sent");
  assert.equal(sender.calls.length, 3);
  assert.equal(new Set(sender.calls.map((c) => c.idempotencyKey)).size, 1, "one provider idempotency key for the message");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, "confirmed");
});

test("after five failed attempts it is failed for manual follow-up, not retried for ever", async () => {
  const { order, capture } = await pendingOrder({ email: "dead@example.test" });
  await settleCapturedPayment({ ...capture, source: "client" });
  const sender = fakeSender(() => "error");
  let now = new Date();
  for (let i = 0; i < 6; i++) {
    await deliverMine(order.id, sender.send, now);
    const [r] = await rows(order.id);
    now = new Date(Math.max(now.getTime(), r.availableAt.getTime()) + 1);
  }
  const [r] = await rows(order.id);
  assert.deepEqual([r.state, r.attempts, r.lastError], ["failed", 5, "retry_limit_manual_reconciliation_required"]);
  assert.equal(sender.calls.length, 5);
});

test("without email configured nothing is sent and nothing is marked sent", async () => {
  const { order, capture } = await pendingOrder({ email: "noconfig@example.test" });
  await settleCapturedPayment({ ...capture, source: "client" });
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  try {
    assert.deepEqual(await deliverOrderEmails(), { sent: 0, failed: 0, configured: false });
  } finally {
    if (saved.key !== undefined) process.env.RESEND_API_KEY = saved.key;
    if (saved.from !== undefined) process.env.EMAIL_FROM = saved.from;
  }
  const [r] = await rows(order.id);
  assert.deepEqual([r.state, r.attempts], ["queued", 0]);
});

test("a confirmation that waited more than a day for its first attempt is skipped, not sent late", async () => {
  const { order, capture } = await pendingOrder({ email: "late@example.test" });
  await settleCapturedPayment({ ...capture, source: "client" });
  const [queued] = await rows(order.id);
  const sender = fakeSender();
  await deliverMine(order.id, sender.send, new Date(queued.createdAt.getTime() + 25 * 3_600_000));
  const [r] = await rows(order.id);
  assert.deepEqual([r.state, r.lastError], ["skipped", "too_old_to_send"]);
  assert.equal(sender.calls.length, 0);
});

test("queueing is idempotent per order", async () => {
  const { order, capture } = await pendingOrder({ email: "twice@example.test" });
  await settleCapturedPayment({ ...capture, source: "client" });
  await db.$transaction((tx) => enqueueOrderConfirmation(tx, order.id));
  assert.equal((await rows(order.id)).length, 1);
});
