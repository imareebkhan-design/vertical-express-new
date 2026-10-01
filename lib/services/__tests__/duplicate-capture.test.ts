import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { handleConfirmPayment } from "@/lib/api/v1";
import { listCapturedPaymentsOnDeadOrders, listDuplicateCaptures } from "@/lib/services/checkout";

/**
 * E5 — a second, different capture for an order that is already paid.
 *
 * These fixtures are DEFENSIVE, not a documented Razorpay behaviour. Razorpay's
 * Orders docs (checked 28 Sep 2026) say no further payment is allowed once an
 * order is `paid`, nor while a payment on it is `authorized`. The one route the
 * docs leave open is late authorization: a bank may confirm an earlier attempt
 * up to 3 days later, and the default setting auto-captures authorized
 * payments — the docs do not say whether that is refused when another payment
 * already paid the order. The signed callbacks and webhooks below simulate
 * that second capture; whether it can happen in production is unverified.
 *
 * The settlement code kept the first payment id ("first writer wins") and
 * answered the second "already confirmed" — correct for a *redelivery* of the
 * same payment, but for a different payment it meant a customer's money was
 * taken and recorded nowhere: no payment row, no event, no alert, no worklist.
 *
 * The rule asserted here: money that arrived is never dropped. A different
 * capture on a settled order gets its own captured payment row, one timeline
 * event, and a place on the refund worklist — exactly once, however many ways
 * and times it is reported.
 */

const CHECKOUT_SECRET = "test-razorpay-secret-not-real";
const WEBHOOK_SECRET = "test-webhook-secret-not-real";
const TOKEN = "dup-capture";
const UID = `uid-dup-${randomUUID().slice(0, 8)}`;
const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN ? ({ uid: UID } as DecodedIdToken) : null;

let userId: string;
const prev = { c: process.env.RAZORPAY_KEY_SECRET, w: process.env.RAZORPAY_WEBHOOK_SECRET };
const orderIds: string[] = [];

before(async () => {
  process.env.RAZORPAY_KEY_SECRET = CHECKOUT_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  userId = (
    await db.user.create({ data: { id: randomUUID(), firebaseUid: UID, phone: `+9196${String(Math.random()).slice(2, 10)}` } })
  ).id;
});

after(async () => {
  process.env.RAZORPAY_KEY_SECRET = prev.c;
  process.env.RAZORPAY_WEBHOOK_SECRET = prev.w;
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: userId } });
});

async function makeOrder(status: "pending_payment" | "cancelled" = "pending_payment") {
  const amount = 50000;
  const gw = `order_${randomUUID().slice(0, 14)}`;
  const order = await db.order.create({
    data: {
      orderNo: `ZZZDUP-${randomUUID().slice(0, 8)}`,
      userId,
      address: {},
      status,
      paymentMethod: "razorpay",
      subtotalPaise: amount,
      totalPaise: amount,
      payments: { create: { gateway: "razorpay", gatewayOrderId: gw, amountPaise: amount, status: "created" } },
    },
    include: { payments: true },
  });
  orderIds.push(order.id);
  return { id: order.id, orderNo: order.orderNo, gw, amount, paymentId: order.payments[0].id };
}

const pid = () => `pay_${randomUUID().slice(0, 12)}`;

function hook(event: string, gw: string, paymentId: string, amount: number, eventId = `evt_${randomUUID().slice(0, 10)}`) {
  const raw = JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: gw, amount } } } });
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": eventId, "content-type": "application/json" },
    body: raw,
  });
}

const confirm = (orderNo: string, gw: string, paymentId: string) =>
  handleConfirmPayment(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: gw,
        razorpayPaymentId: paymentId,
        signature: createHmac("sha256", CHECKOUT_SECRET).update(`${gw}|${paymentId}`).digest("hex"),
      }),
    }),
    orderNo,
    { verify }
  );

const rows = async (o: { id: string }) => {
  const order = await db.order.findUniqueOrThrow({
    where: { id: o.id },
    include: { payments: { orderBy: { createdAt: "asc" } }, statusEvents: { orderBy: { createdAt: "asc" } } },
  });
  return {
    status: order.status,
    payments: order.payments,
    captured: order.payments.filter((p) => p.status === "captured"),
    /* Transitions into confirmed; the second-capture note is confirmed → confirmed. */
    confirmedEvents: order.statusEvents.filter((e) => e.fromStatus === "pending_payment" && e.toStatus === "confirmed").length,
    duplicateEvents: order.statusEvents.filter((e) => /second payment/i.test(e.note ?? "")).length,
  };
};

test("a different capture on a confirmed order is recorded as its own payment, once, and listed for refund", async () => {
  const o = await makeOrder();
  const first = pid();
  const second = pid();
  assert.equal((await webhook(hook("payment.captured", o.gw, first, o.amount))).status, 200);
  assert.equal((await webhook(hook("payment.captured", o.gw, second, o.amount))).status, 200);

  const r = await rows(o);
  assert.equal(r.status, "confirmed");
  assert.equal(r.confirmedEvents, 1, "the order is confirmed once");
  assert.equal(r.payments.find((p) => p.id === o.paymentId)?.gatewayPaymentId, first, "the first payment keeps its id");
  assert.deepEqual(
    r.captured.map((p) => [p.gatewayPaymentId, p.amountPaise]),
    [[first, o.amount], [second, o.amount]],
    "both captures are on the ledger"
  );
  assert.equal(r.duplicateEvents, 1, "one timeline event names the second payment");

  const dup = await listDuplicateCaptures();
  const mine = dup.filter((d) => d.order.orderNo === o.orderNo);
  assert.deepEqual(mine.map((d) => d.gatewayPaymentId), [second], "only the second capture is listed for refund");
});

test("the second capture reported again — redelivered, as order.paid, and by the browser — is still recorded once", async () => {
  const o = await makeOrder();
  const first = pid();
  const second = pid();
  await webhook(hook("payment.captured", o.gw, first, o.amount));
  const evt = `evt_${randomUUID().slice(0, 10)}`;
  await webhook(hook("payment.captured", o.gw, second, o.amount, evt));
  await webhook(hook("payment.captured", o.gw, second, o.amount, evt)); // same delivery again
  await webhook(hook("order.paid", o.gw, second, o.amount)); // another event for the same payment
  assert.equal((await confirm(o.orderNo, o.gw, second)).status, 200, "the order is paid; the browser is told so");
  await webhook(hook("payment.captured", o.gw, first, o.amount)); // and the first one again

  const r = await rows(o);
  assert.equal(r.captured.length, 2);
  assert.equal(r.duplicateEvents, 1);
  assert.equal(r.confirmedEvents, 1);
});

test("a second capture reported only by the browser callback is recorded too", async () => {
  const o = await makeOrder();
  const first = pid();
  const second = pid();
  assert.equal((await confirm(o.orderNo, o.gw, first)).status, 200);
  assert.equal((await confirm(o.orderNo, o.gw, second)).status, 200);

  const r = await rows(o);
  assert.deepEqual(r.captured.map((p) => p.gatewayPaymentId), [first, second]);
  assert.equal(r.duplicateEvents, 1);
});

test("two different captures racing on a pending order: one confirms it, the other is recorded as the second", async () => {
  for (let i = 0; i < 4; i++) {
    const o = await makeOrder();
    const a = pid();
    const b = pid();
    const res = await Promise.all([
      webhook(hook("payment.captured", o.gw, a, o.amount)),
      webhook(hook("payment.captured", o.gw, b, o.amount)),
      confirm(o.orderNo, o.gw, b),
      webhook(hook("order.paid", o.gw, b, o.amount)),
    ]);
    for (const x of res) assert.equal(x.status, 200);

    const r = await rows(o);
    assert.equal(r.status, "confirmed");
    assert.equal(r.confirmedEvents, 1);
    assert.equal(r.captured.length, 2, `run ${i}: both captures recorded exactly once`);
    assert.deepEqual(new Set(r.captured.map((p) => p.gatewayPaymentId)), new Set([a, b]));
    assert.equal(r.duplicateEvents, 1, `run ${i}: one event for the second capture`);
  }
});

test("a second, different late capture on a cancelled order is recorded and on the refund worklist beside the first", async () => {
  const o = await makeOrder("cancelled");
  const first = pid();
  const second = pid();
  await webhook(hook("payment.captured", o.gw, first, o.amount));
  const res = await webhook(hook("payment.captured", o.gw, second, o.amount));
  assert.equal((await res.json()).status, "late_payment_recorded");
  assert.equal((await confirm(o.orderNo, o.gw, second)).status, 409, "the browser is told the order expired");

  const r = await rows(o);
  assert.equal(r.status, "cancelled", "never resurrected");
  assert.deepEqual(r.captured.map((p) => p.gatewayPaymentId), [first, second]);
  const worklist = (await listCapturedPaymentsOnDeadOrders()).filter((w) => w.order.orderNo === o.orderNo);
  assert.deepEqual(new Set(worklist.map((w) => w.gatewayPaymentId)), new Set([first, second]));
});

test("a same-payment redelivery never creates a second row", async () => {
  const o = await makeOrder();
  const p = pid();
  await webhook(hook("payment.captured", o.gw, p, o.amount));
  await webhook(hook("order.paid", o.gw, p, o.amount));
  await confirm(o.orderNo, o.gw, p);
  const r = await rows(o);
  assert.equal(r.payments.length, 1);
  assert.equal(r.duplicateEvents, 0);
  assert.equal((await listDuplicateCaptures()).filter((d) => d.order.orderNo === o.orderNo).length, 0);
});

test("refund worklist: a paid-twice order appears once while live, and after cancellation only on the dead-order list, with no payment in both", async () => {
  const o = await makeOrder();
  const first = pid();
  const second = pid();
  await webhook(hook("payment.captured", o.gw, first, o.amount));
  await webhook(hook("payment.captured", o.gw, second, o.amount));

  const combined = async () => {
    const [dead, dup] = await Promise.all([listCapturedPaymentsOnDeadOrders(), listDuplicateCaptures()]);
    return [...dead, ...dup].filter((w) => w.order.orderNo === o.orderNo);
  };
  const live = await combined();
  assert.deepEqual(live.map((w) => w.gatewayPaymentId), [second], "live: only the second capture needs a refund");

  await db.order.update({ where: { id: o.id }, data: { status: "cancelled" } });
  const dead = await combined();
  assert.deepEqual(new Set(dead.map((w) => w.gatewayPaymentId)), new Set([first, second]), "cancelled: both captures");
  assert.equal(new Set(dead.map((w) => w.id)).size, dead.length, "no payment listed twice");
});
