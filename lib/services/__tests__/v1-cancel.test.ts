import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { APP_CANCEL_REASON, handleCancelOrder, handleGetOrder } from "@/lib/api/v1";
import type { CapturedLookup } from "@/lib/services/orders";

/**
 * C-9 — the phone app cancels an unpaid order through POST /api/v1/orders/:orderNo/cancel,
 * and learns from GET /api/v1/orders/:orderNo whether to offer Cancel at all.
 *
 * The endpoint calls the website's own cancelOrder service, so these tests pin the
 * HTTP contract (status, code, message, metadata, body), not the cancel rules
 * themselves — those are covered by order-cancel-paid, cancel-lost-callback,
 * cancel-closes-shipments and shipment-cancel-stock, including restocking.
 */

const TOKEN_A = "c9-a";
const TOKEN_B = "c9-b";
const UID_A = `uid-c9-a-${randomUUID().slice(0, 8)}`;
const UID_B = `uid-c9-b-${randomUUID().slice(0, 8)}`;
const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN_A ? ({ uid: UID_A } as DecodedIdToken) : token === TOKEN_B ? ({ uid: UID_B } as DecodedIdToken) : null;

let userA: string;
let userB: string;
const orderIds: string[] = [];
const priorMode = process.env.COMMERCE_MODE;

before(async () => {
  const mk = async (uid: string) =>
    (await db.user.create({ data: { id: randomUUID(), firebaseUid: uid, phone: `+9194${String(Math.random()).slice(2, 10)}` } })).id;
  userA = await mk(UID_A);
  userB = await mk(UID_B);
});

after(async () => {
  if (priorMode === undefined) delete process.env.COMMERCE_MODE;
  else process.env.COMMERCE_MODE = priorMode;
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

type Kind = "online" | "cod";
async function order(kind: Kind, status: "pending_payment" | "confirmed" | "packed", paymentStatus = "created") {
  const amount = 36900;
  const gw = `order_${randomUUID().slice(0, 14)}`;
  const o = await db.order.create({
    data: {
      orderNo: `ZZZC9-${randomUUID().slice(0, 8)}`,
      userId: userA,
      address: {},
      status,
      paymentMethod: kind === "cod" ? "cod" : "razorpay",
      subtotalPaise: amount,
      totalPaise: amount,
      ...(kind === "online"
        ? { payments: { create: { gateway: "razorpay", gatewayOrderId: gw, amountPaise: amount, status: paymentStatus as "created" } } }
        : {}),
    },
  });
  orderIds.push(o.id);
  return { id: o.id, orderNo: o.orderNo, gw, amount };
}

const req = (token: string | null) =>
  new Request("http://localhost/x", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
const nothingPaid = async () => null;
const cancel = (orderNo: string, findCaptured: (gw: string) => Promise<CapturedLookup | null> = nothingPaid, token: string | null = TOKEN_A) =>
  handleCancelOrder(req(token), orderNo, { verify, findCaptured, listAttempts: async () => [] });
const get = (orderNo: string, findCaptured: (gw: string) => Promise<CapturedLookup | null> = nothingPaid) =>
  handleGetOrder(new Request("http://localhost/x", { headers: { authorization: `Bearer ${TOKEN_A}` } }), orderNo, {
    verify,
    findCaptured,
    listAttempts: async () => [],
  });

type Body = {
  ok: boolean;
  data?: { orderNo: string; status: string; cancel: { kind: string } };
  error?: { code: string; message: string; metadata?: { reason?: string } };
};
const json = async (res: Response) => (await res.json()) as Body;
const statusOf = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status;

test("no token is 401 and nothing changes", async () => {
  const o = await order("cod", "confirmed");
  const res = await cancel(o.orderNo, nothingPaid, null); // null, not undefined: undefined would take the default token
  assert.equal(res.status, 401);
  assert.equal((await json(res)).error?.code, "UNAUTHENTICATED");
  assert.equal(await statusOf(o.id), "confirmed");
});

test("another customer's order is 404, never 403, and nothing changes", async () => {
  const o = await order("cod", "confirmed");
  const res = await cancel(o.orderNo, nothingPaid, TOKEN_B);
  assert.equal(res.status, 404);
  assert.deepEqual((await json(res)).error?.metadata, { reason: "NOT_FOUND" });
  assert.equal(await statusOf(o.id), "confirmed");
});

test("a confirmed cash-on-delivery order cancels and the body is the refreshed detail", async () => {
  const o = await order("cod", "confirmed");
  const res = await cancel(o.orderNo);
  assert.equal(res.status, 200);
  const b = await json(res);
  assert.equal(b.data?.orderNo, o.orderNo);
  assert.equal(b.data?.status, "cancelled");
  assert.equal(b.data?.cancel.kind, "not-cancellable");
  const row = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { statusEvents: true } });
  assert.equal(row.cancelledReason, APP_CANCEL_REASON);
  assert.ok(row.statusEvents.some((e) => e.toStatus === "cancelled" && e.note === APP_CANCEL_REASON && e.actorUserId === userA));
});

test("an online order awaiting payment, nothing captured at Razorpay, cancels", async () => {
  const o = await order("online", "pending_payment");
  const asked: string[] = [];
  const res = await cancel(o.orderNo, async (gw) => (asked.push(gw), null));
  assert.equal(res.status, 200);
  assert.deepEqual(asked, [o.gw], "Razorpay is asked about this order before cancelling");
  assert.equal(await statusOf(o.id), "cancelled");
});

test("paid at Razorpay with the callback lost: 409 paid message, and the order is now confirmed", async () => {
  const o = await order("online", "pending_payment");
  const paid = async () => ({ gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`, amountPaise: o.amount });
  const res = await cancel(o.orderNo, paid);
  assert.equal(res.status, 409);
  const b = await json(res);
  assert.equal(b.error?.code, "CONFLICT");
  assert.match(b.error?.message ?? "", /This order is paid, so it can’t be cancelled here/);
  assert.deepEqual(b.error?.metadata, { reason: "PAID_NOT_CANCELLABLE" });
  assert.equal(await statusOf(o.id), "confirmed");
});

test("Razorpay cannot be reached: 503 UNAVAILABLE and the order is unchanged", async () => {
  const o = await order("online", "pending_payment");
  const res = await cancel(o.orderNo, async () => {
    throw new Error("timeout");
  });
  assert.equal(res.status, 503);
  const b = await json(res);
  assert.equal(b.error?.code, "UNAVAILABLE");
  assert.match(b.error?.message ?? "", /don’t pay again/);
  assert.deepEqual(b.error?.metadata, { reason: "PAYMENT_STATUS_UNKNOWN" });
  assert.equal(await statusOf(o.id), "pending_payment");
});

test("a confirmed online order is refused as paid; a packed one as too late", async () => {
  const paidOrder = await order("online", "confirmed", "captured");
  const paidRes = await json(await cancel(paidOrder.orderNo));
  assert.deepEqual(paidRes.error?.metadata, { reason: "PAID_NOT_CANCELLABLE" });
  assert.equal(await statusOf(paidOrder.id), "confirmed");

  const packed = await order("cod", "packed");
  const packedRes = await cancel(packed.orderNo);
  assert.equal(packedRes.status, 409);
  const b = await json(packedRes);
  assert.equal(b.error?.message, "This order can no longer be cancelled");
  assert.deepEqual(b.error?.metadata, { reason: "NOT_CANCELLABLE" });
  assert.equal(await statusOf(packed.id), "packed");
});

test("cancelling twice: the second is 409 'no longer' and records no second event", async () => {
  const o = await order("cod", "confirmed");
  assert.equal((await cancel(o.orderNo)).status, 200);
  const second = await cancel(o.orderNo);
  assert.equal(second.status, 409);
  assert.equal((await json(second)).error?.message, "This order can no longer be cancelled");
  const events = await db.orderStatusEvent.count({ where: { orderId: o.id, toStatus: "cancelled" } });
  assert.equal(events, 1);
});

test("catalogue mode does not stop a customer cancelling an unpaid order", async () => {
  process.env.COMMERCE_MODE = "catalogue";
  try {
    const o = await order("cod", "confirmed");
    const res = await cancel(o.orderNo);
    assert.equal(res.status, 200);
    assert.equal(await statusOf(o.id), "cancelled");
  } finally {
    if (priorMode === undefined) delete process.env.COMMERCE_MODE;
    else process.env.COMMERCE_MODE = priorMode;
  }
});

test("GET detail says whether to offer Cancel, after reconciling with Razorpay", async () => {
  const cod = await order("cod", "confirmed");
  assert.equal((await json(await get(cod.orderNo))).data?.cancel.kind, "allowed");

  const paid = await order("online", "confirmed", "captured");
  assert.equal((await json(await get(paid.orderNo))).data?.cancel.kind, "paid-online");

  const packed = await order("cod", "packed");
  assert.equal((await json(await get(packed.orderNo))).data?.cancel.kind, "not-cancellable");

  const awaiting = await order("online", "pending_payment");
  assert.equal((await json(await get(awaiting.orderNo))).data?.cancel.kind, "allowed");

  /* Settled by the reconciliation inside this very GET: must not come back `allowed`. */
  const lost = await order("online", "pending_payment");
  const settled = await json(await get(lost.orderNo, async () => ({ gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`, amountPaise: lost.amount })));
  assert.equal(settled.data?.status, "confirmed");
  assert.equal(settled.data?.cancel.kind, "paid-online");
});
