import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { handleConfirmPayment, handleGetOrder } from "@/lib/api/v1";
import { listCapturedPaymentsOnDeadOrders } from "@/lib/services/checkout";
import { cleanupExpiredPendingOrders } from "@/lib/services/orders";

/**
 * The payment state machine under duplicates, delays and races.
 *
 * Invariants asserted throughout:
 *   - a verified capture is never lost (payment row says `captured`);
 *   - a cancelled order is never resurrected;
 *   - one capture produces at most one status event, however it arrives;
 *   - one customer's payment is never visible to or settled by another.
 */

const CHECKOUT_SECRET = "test-razorpay-secret-not-real";
const WEBHOOK_SECRET = "test-webhook-secret-not-real";
const TOKEN_A = "settle-a";
const TOKEN_B = "settle-b";
const UID_A = `uid-settle-a-${randomUUID().slice(0, 8)}`;
const UID_B = `uid-settle-b-${randomUUID().slice(0, 8)}`;
const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN_A ? ({ uid: UID_A } as DecodedIdToken) : token === TOKEN_B ? ({ uid: UID_B } as DecodedIdToken) : null;

let userA: string;
let userB: string;
const prev = { c: process.env.RAZORPAY_KEY_SECRET, w: process.env.RAZORPAY_WEBHOOK_SECRET };
const orderIds: string[] = [];

before(async () => {
  process.env.RAZORPAY_KEY_SECRET = CHECKOUT_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const mk = async (uid: string) =>
    (await db.user.create({ data: { id: randomUUID(), firebaseUid: uid, phone: `+9197${String(Math.random()).slice(2, 10)}` } })).id;
  userA = await mk(UID_A);
  userB = await mk(UID_B);
});

after(async () => {
  process.env.RAZORPAY_KEY_SECRET = prev.c;
  process.env.RAZORPAY_WEBHOOK_SECRET = prev.w;
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

async function makeOrder(opts: { user?: string; status?: "pending_payment" | "cancelled" | "confirmed"; amount?: number; old?: boolean } = {}) {
  const amount = opts.amount ?? 50000;
  const gw = `order_${randomUUID().slice(0, 14)}`;
  const order = await db.order.create({
    data: {
      orderNo: `ZZZST-${randomUUID().slice(0, 8)}`,
      userId: opts.user ?? userA,
      address: {},
      status: opts.status ?? "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: amount,
      totalPaise: amount,
      ...(opts.old ? { placedAt: new Date(Date.now() - 60 * 60 * 1000) } : {}),
      payments: { create: { gateway: "razorpay", gatewayOrderId: gw, amountPaise: amount, status: "created" } },
    },
    include: { payments: true },
  });
  orderIds.push(order.id);
  return { id: order.id, orderNo: order.orderNo, gw, amount, paymentId: order.payments[0].id };
}

const pid = () => `pay_${randomUUID().slice(0, 12)}`;
const clientSig = (o: string, p: string) => createHmac("sha256", CHECKOUT_SECRET).update(`${o}|${p}`).digest("hex");

function hook(event: string, gw: string, paymentId: string, amount: number, eventId = `evt_${randomUUID().slice(0, 10)}`) {
  const raw = JSON.stringify({
    event,
    event_id: eventId,
    payload: { payment: { entity: { id: paymentId, order_id: gw, amount } } },
  });
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: { "x-razorpay-signature": sig, "content-type": "application/json" },
    body: raw,
  });
}

const confirm = (token: string, orderNo: string, gw: string, paymentId: string) =>
  handleConfirmPayment(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ razorpayOrderId: gw, razorpayPaymentId: paymentId, signature: clientSig(gw, paymentId) }),
    }),
    orderNo,
    { verify }
  );

const events = (orderId: string) => db.orderStatusEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
const state = async (o: { id: string }) =>
  db.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } });

test("webhook: a normal capture confirms the order once", async () => {
  const o = await makeOrder();
  const res = await webhook(hook("payment.captured", o.gw, pid(), o.amount));
  assert.equal(res.status, 200);
  const row = await state(o);
  assert.equal(row.status, "confirmed");
  assert.equal(row.payments[0].status, "captured");
  assert.equal((await events(o.id)).filter((e) => e.toStatus === "confirmed").length, 1);
});

test("webhook: the same event delivered twice, and a second event for the same payment, change nothing more", async () => {
  const o = await makeOrder();
  const p = pid();
  const evt = `evt_${randomUUID().slice(0, 10)}`;
  await webhook(hook("payment.captured", o.gw, p, o.amount, evt));
  const dup = await (await webhook(hook("payment.captured", o.gw, p, o.amount, evt))).json();
  assert.equal(dup.status, "already_processed");
  await webhook(hook("order.paid", o.gw, p, o.amount)); // different event id, same payment
  assert.equal((await events(o.id)).filter((e) => e.toStatus === "confirmed").length, 1);
  assert.equal((await state(o)).payments[0].gatewayPaymentId, p);
});

test("webhook: a wrong amount is refused and nothing is recorded", async () => {
  const o = await makeOrder();
  const res = await webhook(hook("payment.captured", o.gw, pid(), o.amount - 1));
  assert.equal(res.status, 400);
  const row = await state(o);
  assert.equal(row.status, "pending_payment");
  assert.equal(row.payments[0].status, "created");
});

test("webhook: a capture for an unknown gateway order binds to nothing", async () => {
  const o = await makeOrder();
  const res = await webhook(hook("payment.captured", `order_${randomUUID().slice(0, 14)}`, pid(), o.amount));
  assert.equal(res.status, 200);
  assert.equal((await state(o)).status, "pending_payment");
});

test("late capture: money is recorded, the order stays cancelled, and it is on the refund worklist", async () => {
  const o = await makeOrder({ status: "cancelled" });
  const p = pid();
  const res = await webhook(hook("payment.captured", o.gw, p, o.amount));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "late_payment_recorded");

  const row = await state(o);
  assert.equal(row.status, "cancelled", "a cancelled order must not be resurrected");
  assert.equal(row.payments[0].status, "captured", "the captured money must be recorded");
  assert.equal(row.payments[0].gatewayPaymentId, p);
  assert.equal((await events(o.id)).filter((e) => e.toStatus === "confirmed").length, 0);
  const lateEvents = (await events(o.id)).filter((e) => /after this order expired/.test(e.note ?? ""));
  assert.equal(lateEvents.length, 1);

  const worklist = await listCapturedPaymentsOnDeadOrders();
  assert.ok(worklist.some((w) => w.order.orderNo === o.orderNo && w.amountPaise === o.amount));
});

test("late capture: redelivery is idempotent — still one event", async () => {
  const o = await makeOrder({ status: "cancelled" });
  const p = pid();
  await webhook(hook("payment.captured", o.gw, p, o.amount));
  await webhook(hook("payment.captured", o.gw, p, o.amount));
  await webhook(hook("order.paid", o.gw, p, o.amount));
  assert.equal((await events(o.id)).filter((e) => /after this order expired/.test(e.note ?? "")).length, 1);
});

test("late capture with the wrong amount is refused, not recorded", async () => {
  const o = await makeOrder({ status: "cancelled" });
  const res = await webhook(hook("payment.captured", o.gw, pid(), o.amount + 1));
  assert.equal(res.status, 400);
  assert.equal((await state(o)).payments[0].status, "created");
});

test("payment.failed never downgrades a captured payment; it does mark an unpaid one failed", async () => {
  const paid = await makeOrder();
  const p = pid();
  await webhook(hook("payment.captured", paid.gw, p, paid.amount));
  await webhook(hook("payment.failed", paid.gw, pid(), paid.amount)); // an earlier failed attempt, arriving late
  const row = await state(paid);
  assert.equal(row.payments[0].status, "captured");
  assert.equal(row.payments[0].gatewayPaymentId, p);

  const unpaid = await makeOrder();
  await webhook(hook("payment.failed", unpaid.gw, pid(), unpaid.amount));
  assert.equal((await state(unpaid)).payments[0].status, "failed");
  assert.equal((await state(unpaid)).status, "pending_payment");
});

test("client confirmation after expiry: 409 LATE_PAYMENT, recorded once, never told to pay again", async () => {
  const o = await makeOrder({ status: "cancelled" });
  const p = pid();
  const first = await confirm(TOKEN_A, o.orderNo, o.gw, p);
  const body = await first.json();
  assert.equal(first.status, 409);
  assert.equal(body.error.metadata.reason, "LATE_PAYMENT");
  assert.match(body.error.message, /do not pay again/i);

  const again = await confirm(TOKEN_A, o.orderNo, o.gw, p);
  assert.equal(again.status, 409);

  const row = await state(o);
  assert.equal(row.status, "cancelled");
  assert.equal(row.payments[0].status, "captured");
  assert.equal((await events(o.id)).filter((e) => /after this order expired/.test(e.note ?? "")).length, 1);
});

test("ordering: client first then webhook, and webhook first then client, each confirm exactly once", async () => {
  const a = await makeOrder();
  const pa = pid();
  assert.equal((await confirm(TOKEN_A, a.orderNo, a.gw, pa)).status, 200);
  assert.equal((await webhook(hook("payment.captured", a.gw, pa, a.amount))).status, 200);
  assert.equal((await events(a.id)).filter((e) => e.toStatus === "confirmed").length, 1);

  const b = await makeOrder();
  const pb = pid();
  await webhook(hook("payment.captured", b.gw, pb, b.amount));
  assert.equal((await confirm(TOKEN_A, b.orderNo, b.gw, pb)).status, 200);
  assert.equal((await events(b.id)).filter((e) => e.toStatus === "confirmed").length, 1);
  assert.equal((await state(b)).status, "confirmed");
});

test("race: client, webhook and a retry at once produce a single confirmation", async () => {
  const o = await makeOrder();
  const p = pid();
  const results = await Promise.all([
    confirm(TOKEN_A, o.orderNo, o.gw, p),
    webhook(hook("payment.captured", o.gw, p, o.amount)),
    confirm(TOKEN_A, o.orderNo, o.gw, p),
  ]);
  for (const r of results) assert.equal(r.status, 200);
  assert.equal((await events(o.id)).filter((e) => e.toStatus === "confirmed").length, 1);
  assert.equal((await state(o)).status, "confirmed");
});

test("race: expiry and payment at once never lose the money or contradict themselves", async () => {
  for (let i = 0; i < 4; i++) {
    const o = await makeOrder({ old: true });
    const p = pid();
    const [, res] = await Promise.all([cleanupExpiredPendingOrders(15), confirm(TOKEN_A, o.orderNo, o.gw, p)]);
    const row = await state(o);
    assert.equal(row.payments[0].status, "captured", "captured money must always be recorded");
    if (row.status === "confirmed") {
      assert.equal(res.status, 200);
    } else {
      assert.equal(row.status, "cancelled");
      assert.equal(res.status, 409, "a payment on a cancelled order must not read as success");
    }
  }
});

test("isolation: another customer can neither settle nor see this payment", async () => {
  const o = await makeOrder({ user: userA });
  const p = pid();
  const stolen = await confirm(TOKEN_B, o.orderNo, o.gw, p);
  assert.equal(stolen.status, 402);
  assert.equal((await state(o)).payments[0].status, "created");

  const late = await makeOrder({ user: userA, status: "cancelled" });
  const stolenLate = await confirm(TOKEN_B, late.orderNo, late.gw, pid());
  assert.equal(stolenLate.status, 402, "must not reveal or record a payment for someone else's order");
  assert.equal((await state(late)).payments[0].status, "created");

  const peek = await handleGetOrder(
    new Request("http://localhost/x", { headers: { authorization: `Bearer ${TOKEN_B}` } }),
    late.orderNo,
    { verify }
  );
  assert.equal(peek.status, 404);
});

test("integrity: a gateway order id names exactly one payment row; COD rows (null) may repeat", async () => {
  const o = await makeOrder();
  const clash = db.payment.create({
    data: { orderId: o.id, gateway: "razorpay", gatewayOrderId: o.gw, amountPaise: 1, status: "created" },
  });
  await assert.rejects(clash, (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002");

  const cod = await makeOrder();
  await db.payment.create({ data: { orderId: cod.id, gateway: "cod", amountPaise: 1, status: "created" } });
  await db.payment.create({ data: { orderId: cod.id, gateway: "cod", amountPaise: 1, status: "created" } });
});
