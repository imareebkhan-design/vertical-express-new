import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getOrderByNo, type CapturedLookup } from "@/lib/services/orders";
import { paymentStatusFor, gatePlaceOrderReplay } from "@/lib/services/payment-status";
import { describePaymentStatus } from "@/lib/payment-status-copy";
import { PAYMENT_PENDING_MESSAGE } from "@/lib/payment-window";

/**
 * Payment safety (10 Oct): one server answer for "was I charged?", used by web,
 * mobile web and the apps. Razorpay is injected; settlement is real (DB).
 */
let userId: string;
const orderIds: string[] = [];

before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID(), firebaseUid: `uid-ps-${randomUUID().slice(0, 8)}`, phone: `+9196${String(Math.random()).slice(2, 10)}` } })).id;
});
after(async () => {
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: userId } });
});

const AMOUNT = 19900;
async function order(opts: { status?: "pending_payment" | "cancelled"; placedAt?: Date; paymentStatus?: "created" | "captured" } = {}) {
  const gw = `order_${randomUUID().slice(0, 14)}`;
  const o = await db.order.create({
    data: {
      orderNo: `ZZZPS-${randomUUID().slice(0, 8)}`,
      userId, address: {}, status: opts.status ?? "pending_payment", paymentMethod: "razorpay",
      subtotalPaise: AMOUNT, totalPaise: AMOUNT,
      payments: { create: { gateway: "razorpay", gatewayOrderId: gw, amountPaise: AMOUNT, status: opts.paymentStatus ?? "created" } },
      ...(opts.placedAt ? { placedAt: opts.placedAt } : {}),
    },
  });
  orderIds.push(o.id);
  return { id: o.id, orderNo: o.orderNo, gw };
}
const load = async (orderNo: string) => (await getOrderByNo(userId, orderNo))!;
const none = async (): Promise<CapturedLookup | null> => null;
const captured = (id = `pay_${randomUUID().slice(0, 10)}`, amountPaise = AMOUNT) => async (): Promise<CapturedLookup | null> => ({ gatewayPaymentId: id, amountPaise, status: "captured" });
const confirmations = async (id: string) =>
  db.orderStatusEvent.count({ where: { orderId: id, fromStatus: "pending_payment", toStatus: "confirmed" } });

test("captured before the window was dismissed: paid, settled once; a repeated check adds nothing", async () => {
  const o = await order();
  const pay = captured();
  const a = await paymentStatusFor(await load(o.orderNo), { findCaptured: pay, listAttempts: async () => ["captured"] });
  assert.deepEqual([a.state, a.canPay, a.orderStatus], ["paid", false, "confirmed"]);
  const b = await paymentStatusFor(await load(o.orderNo), { findCaptured: pay, listAttempts: async () => ["captured"] });
  assert.equal(b.state, "paid");
  assert.equal(await confirmations(o.id), 1, "duplicate checks never confirm twice");
});

test("delayed capture: in flight → pending (no checkout), then paid once Razorpay captures", async () => {
  const o = await order();
  const first = await paymentStatusFor(await load(o.orderNo), { findCaptured: none, listAttempts: async () => ["created"] });
  assert.deepEqual([first.state, first.canPay], ["pending", false]);
  const later = await paymentStatusFor(await load(o.orderNo), { findCaptured: captured(), listAttempts: async () => ["captured"] });
  assert.equal(later.state, "paid");
  assert.equal(await confirmations(o.id), 1);
});

test("verification fails (network outage on either lookup): pending, never unpaid, nothing settled or cancelled", async () => {
  const o = await order();
  const boom = async () => { throw new Error("ETIMEDOUT"); };
  const a = await paymentStatusFor(await load(o.orderNo), { findCaptured: boom, listAttempts: async () => [] });
  const b = await paymentStatusFor(await load(o.orderNo), { findCaptured: none, listAttempts: boom });
  assert.deepEqual([a.state, a.canPay, b.state, b.canPay], ["pending", false, "pending", false]);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "pending_payment");
});

test("bank approved, capture pending (authorized): pending, no checkout", async () => {
  const o = await order();
  const auth = async (): Promise<CapturedLookup | null> => ({ gatewayPaymentId: "pay_auth", amountPaise: AMOUNT, status: "authorized" });
  const s = await paymentStatusFor(await load(o.orderNo), { findCaptured: auth, listAttempts: async () => ["authorized"] });
  assert.deepEqual([s.state, s.canPay], ["pending", false]);
});

test("a capture of a different amount: pending, never settled", async () => {
  const o = await order();
  const s = await paymentStatusFor(await load(o.orderNo), { findCaptured: captured(undefined, 100), listAttempts: async () => ["captured"] });
  assert.deepEqual([s.state, s.canPay], ["pending", false]);
  assert.equal(await confirmations(o.id), 0);
});

test("genuine failure (every attempt failed, none in flight): failed, checkout may be offered", async () => {
  const o = await order();
  const s = await paymentStatusFor(await load(o.orderNo), { findCaptured: none, listAttempts: async () => ["failed", "failed"] });
  assert.deepEqual([s.state, s.canPay], ["failed", true]);
});

test("a failed attempt next to one still in flight: pending (the in-flight one may still take money)", async () => {
  const o = await order();
  const s = await paymentStatusFor(await load(o.orderNo), { findCaptured: none, listAttempts: async () => ["failed", "created"] });
  assert.deepEqual([s.state, s.canPay], ["pending", false]);
});

test("no attempt at all (closed before paying): unpaid, checkout may be offered", async () => {
  const o = await order();
  const s = await paymentStatusFor(await load(o.orderNo), { findCaptured: none, listAttempts: async () => [] });
  assert.deepEqual([s.state, s.canPay], ["unpaid", true]);
});

test("expired: payment window closed with nothing found → expired (no checkout); cancelled order → expired; cancelled but captured → late", async () => {
  const old = await order({ placedAt: new Date(Date.now() - 60 * 60 * 1000) });
  const a = await paymentStatusFor(await load(old.orderNo), { findCaptured: none, listAttempts: async () => [] });
  assert.deepEqual([a.state, a.canPay], ["expired", false]);
  const c = await order({ status: "cancelled" });
  assert.equal((await paymentStatusFor(await load(c.orderNo))).state, "expired");
  const late = await order({ status: "cancelled", paymentStatus: "captured" });
  assert.equal((await paymentStatusFor(await load(late.orderNo))).state, "late");
});

test("repeated retries / replayed place-order: checkout details withheld while a payment may be on its way", async () => {
  const o = await order();
  const replay = { orderNo: o.orderNo, status: "pending_payment", requiresPaymentConfirmation: true, gatewayOrderId: o.gw, amountPaise: AMOUNT, replayed: true };
  const inFlight = await gatePlaceOrderReplay(userId, replay, { findCaptured: none, listAttempts: async () => ["created"] });
  assert.equal(inFlight.gatewayOrderId, null, "no second Checkout on an in-flight attempt");
  assert.equal(inFlight.paymentState, "pending");
  const nothing = await gatePlaceOrderReplay(userId, replay, { findCaptured: none, listAttempts: async () => [] });
  assert.equal(nothing.gatewayOrderId, o.gw, "nothing paid or in flight: the same Razorpay order is offered again");
  const fresh = await gatePlaceOrderReplay(userId, { ...replay, replayed: false }, { findCaptured: async () => { throw new Error("must not be asked"); } });
  assert.equal(fresh.gatewayOrderId, o.gw, "a fresh order is not delayed by a gateway lookup");
});

test("copy: an unknown state is never 'not charged' and offers Check payment status, not Checkout", () => {
  for (const s of [null, "pending"] as const) {
    const c = describePaymentStatus(s);
    assert.equal(c.message, PAYMENT_PENDING_MESSAGE);
    assert.equal(c.action, "check");
  }
  for (const s of ["paid", "late", "pending", "failed", "unpaid", "expired", null] as const) {
    assert.doesNotMatch(describePaymentStatus(s).message, /not (been )?charged|nothing (was|will be) charged/i, String(s));
  }
  assert.equal(describePaymentStatus("unpaid").action, "pay");
  assert.equal(describePaymentStatus("failed").action, "pay");
  assert.equal(describePaymentStatus("late").action, "none");
});

test("copy promises no refund it cannot prove: only 'late' (a captured payment) mentions refunds", () => {
  for (const s of ["paid", "pending", "failed", "unpaid", "expired", null] as const) {
    assert.doesNotMatch(describePaymentStatus(s).message, /refund|returns? it automatically/i, String(s));
  }
  assert.match(describePaymentStatus("late").message, /refund/i);
});
