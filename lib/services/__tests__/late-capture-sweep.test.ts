/**
 * Money paid after an order was cancelled, whose webhook never arrived.
 *
 * Every cancel asks Razorpay first, but the Razorpay order stays payable, so a
 * customer with the payment sheet open can pay afterwards. That capture was
 * recorded only if the webhook reached us. The scheduled sweep is the second
 * witness: it asks about recently cancelled orders and records a capture the
 * same way a late webhook would — captured payment, order still cancelled, on
 * the refund-required list. It never revives an order and never refunds.
 *
 * Time is injected and the fixtures are placed far in the future, so the sweep
 * sees these orders and no other test's.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  LATE_CAPTURE_BATCH_SIZE,
  LATE_CAPTURE_RECHECK_MS,
  LATE_CAPTURE_WINDOW_MS,
  sweepCancelledOrdersForLateCaptures,
} from "../orders";
import { listCapturedPaymentsOnDeadOrders } from "../checkout";
import type { CapturedLookup } from "../payments";

const USER = randomUUID();
const TAG = randomUUID().slice(0, 8);
const AMOUNT = 20000;
const HOUR = 60 * 60 * 1000;
/* Each test gets its own day, a century out. */
let day = 0;
const epoch = () => Date.UTC(2126, 0, 1) + day++ * 24 * HOUR;

async function cancelledOrder(placedAt: number, opts: { payment?: "created" | "failed" | "captured" | "none" } = {}) {
  const gw = `order_${TAG}_${randomUUID().slice(0, 8)}`;
  const payment = opts.payment ?? "created";
  const order = await db.order.create({
    data: {
      orderNo: `ZZZSWEEP-${TAG}-${randomUUID().slice(0, 6)}`,
      userId: USER,
      address: { label: "Site", name: "Sweep Fixture", phone: "+919999999999", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "cancelled",
      cancelledReason: "Payment window expired (15 min)",
      paymentMethod: "razorpay",
      subtotalPaise: AMOUNT,
      totalPaise: AMOUNT,
      placedAt: new Date(placedAt),
      ...(payment === "none" ? {} : { payments: { create: [{ gateway: "razorpay", amountPaise: AMOUNT, status: payment, gatewayOrderId: gw }] } }),
    },
  });
  return { id: order.id, orderNo: order.orderNo, gw };
}

function gateway(answers: Record<string, CapturedLookup | null | Error>) {
  const asked: string[] = [];
  return {
    asked,
    fn: async (gw: string) => {
      asked.push(gw);
      const a = answers[gw] ?? null;
      if (a instanceof Error) throw a;
      return a;
    },
  };
}
const captured = (id: string): CapturedLookup => ({ status: "captured", amountPaise: AMOUNT, gatewayPaymentId: id });
const order = (id: string) => db.order.findUniqueOrThrow({ where: { id }, include: { payments: true } });

before(async () => { await db.user.create({ data: { id: USER } }); });
after(async () => {
  const ids = (await db.order.findMany({ where: { userId: USER }, select: { id: true } })).map((o) => o.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { id: USER } });
});

test("a capture made after the cancel is found: payment captured, order still cancelled, on the refund-required list", async () => {
  const t0 = epoch();
  const paid = await cancelledOrder(t0);
  const unpaid = await cancelledOrder(t0 + 1000);
  const g = gateway({ [paid.gw]: captured(`pay_${TAG}_late`) });

  const r = await sweepCancelledOrdersForLateCaptures({ findCaptured: g.fn, now: () => t0 + HOUR });
  assert.deepEqual(r, { checked: 2, lateCaptures: 1 });
  assert.deepEqual(g.asked, [paid.gw, unpaid.gw]);

  const o = await order(paid.id);
  assert.equal(o.status, "cancelled", "the order is not revived");
  assert.deepEqual(o.payments.map((p) => [p.status, p.gatewayPaymentId]), [["captured", `pay_${TAG}_late`]]);
  const ev = await db.orderStatusEvent.findMany({ where: { orderId: paid.id } });
  assert.equal(ev.length, 1, "one explicit event says money arrived");
  assert.deepEqual([ev[0].fromStatus, ev[0].toStatus], ["cancelled", "cancelled"]);
  assert.ok((await listCapturedPaymentsOnDeadOrders()).some((p) => p.order.orderNo === paid.orderNo), "it is on the refund worklist");

  const u = await order(unpaid.id);
  assert.deepEqual(u.payments.map((p) => p.status), ["created"], "nothing captured, nothing changed");
  assert.equal(await db.orderStatusEvent.count({ where: { orderId: unpaid.id } }), 0);
});

test("an order is asked about at most once per recheck interval, and a found capture is never asked about again", async () => {
  const t0 = epoch();
  const paid = await cancelledOrder(t0);
  const unpaid = await cancelledOrder(t0 + 1000);
  const g = gateway({ [paid.gw]: captured(`pay_${TAG}_once`) });
  const run = (at: number) => sweepCancelledOrdersForLateCaptures({ findCaptured: g.fn, now: () => at });

  assert.deepEqual(await run(t0 + HOUR), { checked: 2, lateCaptures: 1 });
  assert.deepEqual(await run(t0 + HOUR + 5 * 60 * 1000), { checked: 0, lateCaptures: 0 }, "five minutes later: nobody is due");
  assert.deepEqual(await run(t0 + HOUR + LATE_CAPTURE_RECHECK_MS + 1000), { checked: 1, lateCaptures: 0 }, "only the unpaid one is asked again");
  assert.deepEqual(g.asked, [paid.gw, unpaid.gw, unpaid.gw]);
  assert.equal(await db.orderStatusEvent.count({ where: { orderId: paid.id } }), 1, "the capture was recorded once");
});

test("orders outside the window, already captured, or with no Razorpay order are not asked about", async () => {
  const t0 = epoch();
  const old = await cancelledOrder(t0);
  const now = t0 + LATE_CAPTURE_WINDOW_MS + HOUR;
  await cancelledOrder(now - HOUR, { payment: "captured" });
  await cancelledOrder(now - HOUR, { payment: "none" });
  const g = gateway({ [old.gw]: captured(`pay_${TAG}_old`) });
  assert.deepEqual(await sweepCancelledOrdersForLateCaptures({ findCaptured: g.fn, now: () => now }), { checked: 0, lateCaptures: 0 });
  assert.deepEqual(g.asked, []);
});

test("a run is bounded, least-recently-asked first, and the next run takes the rest", async () => {
  const t0 = epoch();
  const made = [];
  for (let i = 0; i < LATE_CAPTURE_BATCH_SIZE + 2; i++) made.push(await cancelledOrder(t0 + i * 1000));
  const g = gateway({});
  assert.deepEqual(await sweepCancelledOrdersForLateCaptures({ findCaptured: g.fn, now: () => t0 + HOUR }), { checked: LATE_CAPTURE_BATCH_SIZE, lateCaptures: 0 });
  assert.deepEqual(g.asked, made.slice(0, LATE_CAPTURE_BATCH_SIZE).map((m) => m.gw));
  assert.deepEqual(await sweepCancelledOrdersForLateCaptures({ findCaptured: g.fn, now: () => t0 + HOUR + 5 * 60 * 1000 }), { checked: 2, lateCaptures: 0 });
  assert.deepEqual(g.asked.slice(LATE_CAPTURE_BATCH_SIZE), made.slice(LATE_CAPTURE_BATCH_SIZE).map((m) => m.gw));
});

test("a gateway failure stops the run after one lookup and changes nothing; a different amount is never settled", async () => {
  const t0 = epoch();
  const a = await cancelledOrder(t0);
  const b = await cancelledOrder(t0 + 1000);
  const g = gateway({ [a.gw]: new Error("ETIMEDOUT") });
  assert.deepEqual(await sweepCancelledOrdersForLateCaptures({ findCaptured: g.fn, now: () => t0 + HOUR }), { checked: 1, lateCaptures: 0 });
  assert.deepEqual(g.asked, [a.gw], "the second order waits for the next run");
  assert.deepEqual((await order(a.id)).payments.map((p) => p.status), ["created"]);

  const wrong = gateway({ [b.gw]: { status: "captured", amountPaise: AMOUNT - 1, gatewayPaymentId: `pay_${TAG}_wrong` } });
  await sweepCancelledOrdersForLateCaptures({ findCaptured: wrong.fn, now: () => t0 + HOUR + 60 * 1000 });
  assert.deepEqual((await order(b.id)).payments.map((p) => p.status), ["created"], "alerted, not settled");
});
