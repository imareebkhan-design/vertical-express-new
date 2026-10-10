import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { handleGetOrder } from "@/lib/api/v1";
import { PaymentConfigError } from "@/lib/services/payments";
import type { CapturedLookup } from "@/lib/services/orders";

/**
 * E5 — the customer comes back to pay an order whose first payment went
 * through but whose confirmation never reached us (browser closed, network
 * dropped, webhook late).
 *
 * The order detail is where a client gets the details to "Complete payment"
 * (the app reads `razorpay` from it; the web retry action goes through the
 * same `reconcileWithGateway`). Before handing them out the server asks
 * Razorpay:
 *   paid, right amount   -> the order comes back confirmed; no checkout offered
 *   nothing paid         -> checkout details as before (the retry flow)
 *   lookup failed        -> no checkout details and nothing marked failed or
 *                           cancelled: the client says "do not pay again"
 *   paid, wrong amount   -> the same, never settled
 *   order died meanwhile -> the capture is recorded as late, order not revived
 */

const TOKEN_A = "resume-a";
const TOKEN_B = "resume-b";
const UID_A = `uid-resume-a-${randomUUID().slice(0, 8)}`;
const UID_B = `uid-resume-b-${randomUUID().slice(0, 8)}`;
const WEBHOOK_SECRET = "test-webhook-secret-not-real";
const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN_A ? ({ uid: UID_A } as DecodedIdToken) : token === TOKEN_B ? ({ uid: UID_B } as DecodedIdToken) : null;

let userA: string;
let userB: string;
const prevWebhook = process.env.RAZORPAY_WEBHOOK_SECRET;
const orderIds: string[] = [];

before(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const mk = async (uid: string) =>
    (await db.user.create({ data: { id: randomUUID(), firebaseUid: uid, phone: `+9195${String(Math.random()).slice(2, 10)}` } })).id;
  userA = await mk(UID_A);
  userB = await mk(UID_B);
});

after(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = prevWebhook;
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

async function pendingOrder(placedAt?: Date) {
  const amount = 36900;
  const gw = `order_${randomUUID().slice(0, 14)}`;
  const order = await db.order.create({
    data: {
      orderNo: `ZZZRES-${randomUUID().slice(0, 8)}`,
      userId: userA,
      address: {},
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: amount,
      totalPaise: amount,
      payments: { create: { gateway: "razorpay", gatewayOrderId: gw, amountPaise: amount, status: "created" } },
      ...(placedAt ? { placedAt } : {}),
    },
  });
  orderIds.push(order.id);
  return { id: order.id, orderNo: order.orderNo, gw, amount };
}

const get = (orderNo: string, findCaptured: (gw: string) => Promise<CapturedLookup | null>, token = TOKEN_A) =>
  handleGetOrder(
    new Request("http://localhost/x", { headers: { authorization: `Bearer ${token}` } }),
    orderNo,
    { verify, findCaptured, listAttempts: async () => [] }
  );

const body = async (res: Response) => ((await res.json()) as { data: { status: string; razorpay: unknown } }).data;
const state = (id: string) =>
  db.order.findUniqueOrThrow({ where: { id }, include: { payments: true, statusEvents: true } });
const transitions = (s: Awaited<ReturnType<typeof state>>) =>
  s.statusEvents.filter((e) => e.fromStatus === "pending_payment" && e.toStatus === "confirmed").length;

test("paid at Razorpay, callback lost: the order comes back confirmed and no second checkout is offered", async () => {
  const o = await pendingOrder();
  const p = `pay_${randomUUID().slice(0, 12)}`;
  let calls = 0;
  const paid = async (gw: string) => {
    calls++;
    assert.equal(gw, o.gw, "asks about this order's Razorpay order");
    return { gatewayPaymentId: p, amountPaise: o.amount };
  };

  const res = await get(o.orderNo, paid);
  assert.equal(res.status, 200);
  const d = await body(res);
  assert.equal(d.status, "confirmed");
  assert.equal(d.razorpay, null, "no checkout for a paid order");

  const s = await state(o.id);
  assert.equal(s.payments[0].status, "captured");
  assert.equal(s.payments[0].gatewayPaymentId, p);
  assert.equal(transitions(s), 1);

  await get(o.orderNo, paid); // reopened again: nothing more to ask, nothing more happens
  assert.equal(calls, 1, "a confirmed order is not looked up again");
  assert.equal(transitions(await state(o.id)), 1);
});

test("nothing paid at Razorpay: the checkout details are offered as before", async () => {
  const o = await pendingOrder();
  const d = await body(await get(o.orderNo, async () => null));
  assert.equal(d.status, "pending_payment");
  assert.deepEqual((d.razorpay as { orderId: string; amountPaise: number }).orderId, o.gw);
  assert.equal((d.razorpay as { amountPaise: number }).amountPaise, o.amount);
  const terms = d.razorpay as { payBy: string; payWithinSeconds: number };
  assert.ok(terms.payWithinSeconds > 890 && terms.payWithinSeconds <= 900, "the window, counted on the server's clock");
  assert.ok(Date.parse(terms.payBy) > Date.now());
});

test("payment window closed but not yet swept: the server offers no checkout, whatever the client does", async () => {
  /* REGRESSION (staging, 8 Oct 2026): an open Checkout took a payment after the
     order's window. Between the window closing and the expiry job's next run
     the order is still pending_payment; it must not be payable. */
  const o = await pendingOrder(new Date(Date.now() - 16 * 60_000));
  let asked = 0;
  const d = await body(await get(o.orderNo, async () => (asked++, null)));
  assert.equal(d.status, "pending_payment", "the expiry job, not this read, cancels it");
  assert.equal(d.razorpay, null);
  assert.equal(asked, 1, "a payment whose callback was lost is still looked for first");

  const nearly = await pendingOrder(new Date(Date.now() - (15 * 60 - 90) * 1000));
  assert.equal((await body(await get(nearly.orderNo, async () => null))).razorpay, null, "90 s left is too little to open Checkout");
});

test("Razorpay cannot be asked: no checkout offered, and nothing is marked failed or cancelled", async () => {
  const o = await pendingOrder();
  const d = await body(await get(o.orderNo, async () => { throw new Error("RAZORPAY_LOOKUP_FAILED:503"); }));
  assert.equal(d.status, "pending_payment");
  assert.equal(d.razorpay, null, "while the answer is unknown, do not invite a second payment");
  const s = await state(o.id);
  assert.equal(s.status, "pending_payment");
  assert.equal(s.payments[0].status, "created");
});

test("a capture of a different amount is never settled and no checkout is offered", async () => {
  const o = await pendingOrder();
  const d = await body(
    await get(o.orderNo, async () => ({ gatewayPaymentId: `pay_${randomUUID().slice(0, 8)}`, amountPaise: o.amount - 100 }))
  );
  assert.equal(d.status, "pending_payment");
  assert.equal(d.razorpay, null);
  assert.equal((await state(o.id)).payments[0].status, "created");
});

test("an authorized payment awaiting capture: no checkout offered, nothing settled", async () => {
  const o = await pendingOrder();
  const d = await body(
    await get(o.orderNo, async () => ({ gatewayPaymentId: `pay_${randomUUID().slice(0, 8)}`, amountPaise: o.amount, status: "authorized" }))
  );
  assert.equal(d.status, "pending_payment");
  assert.equal(d.razorpay, null, "money is held at the bank; do not invite a second payment");
  assert.equal((await state(o.id)).payments[0].status, "created");
});

/* Changed 10 Oct (payment safety): a Razorpay order that cannot be asked about
   is unverifiable, so no second checkout is offered — the client shows
   "don't pay again yet" with Check payment status. Production cannot boot
   without the gateway (assertPaymentConfig), so this only affects dev/test. */
test("no gateway configured in this process: unverifiable, so no checkout details are offered", async () => {
  const o = await pendingOrder();
  const d = await body(await get(o.orderNo, async () => { throw new PaymentConfigError("RAZORPAY_NOT_ACTIVE"); }));
  assert.equal(d.status, "pending_payment");
  assert.equal(d.razorpay, null, "no checkout while unverifiable");
});

test("another customer's order: not found, and Razorpay is never asked", async () => {
  const o = await pendingOrder();
  let asked = false;
  const res = await get(o.orderNo, async () => { asked = true; return null; }, TOKEN_B);
  assert.equal(res.status, 404);
  assert.equal(asked, false, "ownership is checked before any gateway call");
});

test("the order expired between our read and the capture: recorded as late, never revived", async () => {
  const o = await pendingOrder();
  const p = `pay_${randomUUID().slice(0, 12)}`;
  const d = await body(
    await get(o.orderNo, async () => {
      await db.order.update({ where: { id: o.id }, data: { status: "cancelled" } }); // the expiry wins the race
      return { gatewayPaymentId: p, amountPaise: o.amount };
    })
  );
  assert.equal(d.status, "cancelled");
  assert.equal(d.razorpay, null);
  const s = await state(o.id);
  assert.equal(s.payments[0].status, "captured", "the money is recorded");
  assert.equal(transitions(s), 0);
  assert.equal(s.statusEvents.filter((e) => /after this order expired/.test(e.note ?? "")).length, 1);
});

test("the check racing the webhook for the same payment: one confirmation", async () => {
  for (let i = 0; i < 4; i++) {
    const o = await pendingOrder();
    const p = `pay_${randomUUID().slice(0, 12)}`;
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: p, order_id: o.gw, amount: o.amount } } } });
    const hook = new NextRequest("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"),
        "x-razorpay-event-id": `evt_${randomUUID().slice(0, 10)}`,
        "content-type": "application/json",
      },
      body: raw,
    });
    const [res] = await Promise.all([get(o.orderNo, async () => ({ gatewayPaymentId: p, amountPaise: o.amount })), webhook(hook)]);
    assert.equal(res.status, 200);
    const s = await state(o.id);
    assert.equal(s.status, "confirmed");
    assert.equal(transitions(s), 1, `run ${i}: one confirmation`);
    assert.equal(s.payments.length, 1, `run ${i}: same payment, one row`);
  }
});
