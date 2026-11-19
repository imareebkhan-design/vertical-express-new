import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { APP_CANCEL_REASON, handleCancelOrder, handleGetOrder } from "@/lib/api/v1";
import type { CapturedLookup } from "@/lib/services/orders";
import { PaymentConfigError } from "@/lib/services/payments";
import { redeemCoupon } from "@/lib/services/coupon-eligibility";

/**
 * C-9 — the phone app cancels an unpaid order through POST /api/v1/orders/:orderNo/cancel,
 * and learns from GET /api/v1/orders/:orderNo whether to offer Cancel at all.
 *
 * The endpoint calls the website's own cancelOrder service, so these tests pin the
 * HTTP contract (status, code, message, metadata, body) and — the part that is this
 * endpoint's own — that what GET offers is what tapping Cancel then does. The rules
 * themselves stay covered by order-cancel-paid, cancel-lost-callback,
 * cancel-closes-shipments and shipment-cancel-stock.
 */

const TOKEN_A = "c9-a";
const TOKEN_B = "c9-b";
const UID_A = `uid-c9-a-${randomUUID().slice(0, 8)}`;
const UID_B = `uid-c9-b-${randomUUID().slice(0, 8)}`;
const TAG = `C9${randomUUID().slice(0, 6)}`;
const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN_A ? ({ uid: UID_A } as DecodedIdToken) : token === TOKEN_B ? ({ uid: UID_B } as DecodedIdToken) : null;

let userA: string;
let userB: string;
let warehouseId: string;
let productId: string;
let variantId: string;
let couponId: string;
const orderIds: string[] = [];
const priorMode = process.env.COMMERCE_MODE;

before(async () => {
  /* Same "+9194" + 8 digits shape as before; a secure generator only to keep static analysis quiet. */
  const mk = async (uid: string) =>
    (await db.user.create({ data: { id: randomUUID(), firebaseUid: uid, phone: `+9194${randomInt(10_000_000, 100_000_000)}` } })).id;
  userA = await mk(UID_A);
  userB = await mk(UID_B);
  const category = await db.category.findFirst({ select: { id: true } });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!category || !brand) throw new Error("Seed must provide a category and a brand.");
  warehouseId = (await db.warehouse.create({ data: { name: `C9 Test WH ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  productId = (
    await db.product.create({ data: { title: "C9 Test Item", slug: `c9-test-${TAG.toLowerCase()}`, categoryId: category.id, brandId: brand.id } })
  ).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Unit", sku: `SKU-${TAG}`, pricePaise: 5000 } })).id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 100 } });
  couponId = (await db.coupon.create({ data: { code: `ZZZ${TAG}`, type: "flat", value: 500, usageLimit: 1000, perUserLimit: 1000 } })).id;
});

after(async () => {
  if (priorMode === undefined) delete process.env.COMMERCE_MODE;
  else process.env.COMMERCE_MODE = priorMode;
  await db.couponRedemption.deleteMany({ where: { couponId } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.coupon.deleteMany({ where: { id: couponId } });
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
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

/** A confirmed COD order holding 2 units from the test warehouse and one coupon use. */
async function stockedOrder() {
  const o = await db.order.create({
    data: {
      orderNo: `ZZZC9S-${randomUUID().slice(0, 8)}`,
      userId: userA,
      address: {},
      status: "confirmed",
      paymentMethod: "cod",
      subtotalPaise: 10000,
      totalPaise: 9500,
      warehouseId,
      items: { create: { variantId, title: "C9 Test Item", variantName: "Unit", unitPricePaise: 5000, qty: 2, lineTotalPaise: 10000 } },
    },
  });
  orderIds.push(o.id);
  const r = await db.$transaction((tx) => redeemCoupon(tx, { couponId, userId: userA, orderId: o.id, discountPaise: 500 }));
  assert.equal(r.ok, true, "fixture coupon redeemed");
  return { id: o.id, orderNo: o.orderNo };
}

const req = (token: string | null) =>
  new Request("http://localhost/x", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });
type Lookup = (gw: string) => Promise<CapturedLookup | null>;
const nothingPaid: Lookup = async () => null;
const noAttempts = async () => [];
type CancelDeps = NonNullable<Parameters<typeof handleCancelOrder>[2]>;
const cancel = (orderNo: string, findCaptured: Lookup = nothingPaid, token: string | null = TOKEN_A, extra: Partial<CancelDeps> = {}) =>
  handleCancelOrder(req(token), orderNo, { verify, findCaptured, listAttempts: noAttempts, ...extra });
const get = (orderNo: string, findCaptured: Lookup = nothingPaid, listAttempts: (gw: string) => Promise<string[]> = noAttempts) =>
  handleGetOrder(new Request("http://localhost/x", { headers: { authorization: `Bearer ${TOKEN_A}` } }), orderNo, {
    verify,
    findCaptured,
    listAttempts,
  });

type Body = {
  ok: boolean;
  data?: { orderNo: string; status: string; cancel?: { kind: string }; paymentState?: string; alreadyCancelled?: boolean };
  error?: { code: string; message: string; metadata?: { reason?: string } };
};
const json = async (res: Response) => (await res.json()) as Body;
const statusOf = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status;
const cancelEvents = (id: string) => db.orderStatusEvent.count({ where: { orderId: id, toStatus: "cancelled" } });
const onHand = async () => (await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand;
const redeemedCount = async () => (await db.coupon.findUniqueOrThrow({ where: { id: couponId } })).redeemedCount;

/* ------------------------------------------------------------- contract */

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
  assert.equal(b.data?.cancel?.kind, "not-cancellable");
  assert.equal(b.data?.alreadyCancelled, undefined);
  const row = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { statusEvents: true } });
  assert.equal(row.cancelledReason, APP_CANCEL_REASON);
  assert.ok(row.statusEvents.some((e) => e.toStatus === "cancelled" && e.note === APP_CANCEL_REASON && e.actorUserId === userA));
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

test("an order cancelled some other way is refused as 'no longer', not reported as this request's success", async () => {
  const o = await order("online", "pending_payment");
  await db.order.update({ where: { id: o.id }, data: { status: "cancelled", cancelledReason: "Payment window closed" } });
  const res = await cancel(o.orderNo);
  assert.equal(res.status, 409);
  assert.deepEqual((await json(res)).error?.metadata, { reason: "NOT_CANCELLABLE" });
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

test("an unexpected service error is reported as 'try again' — never 'Order not found' — and nothing changes", async () => {
  const o = await order("cod", "confirmed");
  const res = await cancel(o.orderNo, nothingPaid, TOKEN_A, {
    cancel: async () => {
      throw new Error("connection terminated unexpectedly");
    },
  });
  assert.equal(res.status, 409);
  const b = await json(res);
  assert.equal(b.error?.code, "CONFLICT");
  assert.equal(b.error?.message, "Could not cancel this order. Please try again.");
  assert.equal(b.error?.metadata, undefined);
  assert.equal(await statusOf(o.id), "confirmed");
});

/* ------------------------------- what GET offers is what tapping Cancel does */

/**
 * Each case: GET the detail with Razorpay answering one way, then POST cancel with
 * Razorpay answering the same way. Offered `allowed` ⇔ the cancel goes through.
 */
const gatewayCases: {
  name: string;
  lookup: Lookup;
  attempts?: (gw: string) => Promise<string[]>;
  offer: string;
  paymentState: string;
  post: { status: number; reason?: string; orderAfter: string };
}[] = [
  {
    name: "nothing captured, no attempts",
    lookup: nothingPaid,
    offer: "allowed",
    paymentState: "unpaid",
    post: { status: 200, orderAfter: "cancelled" },
  },
  {
    name: "nothing captured, an attempt still in flight (cancel does not wait on attempts)",
    lookup: nothingPaid,
    attempts: async () => ["created"],
    offer: "allowed",
    paymentState: "pending",
    post: { status: 200, orderAfter: "cancelled" },
  },
  {
    name: "bank approved, capture pending (stored payment still 'created')",
    lookup: async () => ({ gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`, amountPaise: 36900, status: "authorized" }),
    offer: "not-cancellable",
    paymentState: "pending",
    post: { status: 409, reason: "PAYMENT_IN_PROGRESS", orderAfter: "pending_payment" },
  },
  {
    name: "Razorpay lookup failed",
    lookup: async () => {
      throw new Error("timeout");
    },
    offer: "not-cancellable",
    paymentState: "pending",
    post: { status: 503, reason: "PAYMENT_STATUS_UNKNOWN", orderAfter: "pending_payment" },
  },
  {
    name: "Razorpay not configured in this process",
    lookup: async () => {
      throw new PaymentConfigError("RAZORPAY_NOT_ACTIVE");
    },
    offer: "not-cancellable",
    paymentState: "pending",
    post: { status: 503, reason: "PAYMENT_STATUS_UNKNOWN", orderAfter: "pending_payment" },
  },
  {
    name: "a capture of a different amount",
    lookup: async () => ({ gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`, amountPaise: 100 }),
    offer: "not-cancellable",
    paymentState: "pending",
    post: { status: 503, reason: "PAYMENT_STATUS_UNKNOWN", orderAfter: "pending_payment" },
  },
];

for (const c of gatewayCases) {
  test(`online, awaiting payment — ${c.name}: GET offers '${c.offer}', and Cancel ${c.post.status === 200 ? "succeeds" : "is refused"}`, async () => {
    const o = await order("online", "pending_payment");
    const detail = await json(await get(o.orderNo, c.lookup, c.attempts));
    assert.equal(detail.data?.cancel?.kind, c.offer, "what the customer is offered");
    assert.equal(detail.data?.paymentState, c.paymentState);

    const res = await cancel(o.orderNo, c.lookup, TOKEN_A, c.attempts ? { listAttempts: c.attempts } : {});
    assert.equal(res.status, c.post.status, "what tapping Cancel does");
    assert.equal((c.offer === "allowed") === (res.status === 200), true, "offered exactly when it would go through");
    const b = await json(res);
    if (c.post.reason) assert.deepEqual(b.error?.metadata, { reason: c.post.reason });
    if (c.post.reason === "PAYMENT_IN_PROGRESS") {
      assert.equal(b.error?.code, "CONFLICT");
      assert.match(b.error?.message ?? "", /still being completed/);
    }
    assert.equal(await statusOf(o.id), c.post.orderAfter);
  });
}

test("GET detail says whether to offer Cancel for stored states, and paid-online right after a settling reconciliation", async () => {
  const cod = await order("cod", "confirmed");
  assert.equal((await json(await get(cod.orderNo))).data?.cancel?.kind, "allowed");

  const paid = await order("online", "confirmed", "captured");
  assert.equal((await json(await get(paid.orderNo))).data?.cancel?.kind, "paid-online");

  const authorizedRow = await order("online", "pending_payment", "authorized");
  assert.equal((await json(await get(authorizedRow.orderNo))).data?.cancel?.kind, "paid-online");
  assert.deepEqual((await json(await cancel(authorizedRow.orderNo))).error?.metadata, { reason: "PAID_NOT_CANCELLABLE" });

  const packed = await order("cod", "packed");
  assert.equal((await json(await get(packed.orderNo))).data?.cancel?.kind, "not-cancellable");

  const lost = await order("online", "pending_payment");
  const settled = await json(await get(lost.orderNo, async () => ({ gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`, amountPaise: lost.amount })));
  assert.equal(settled.data?.status, "confirmed");
  assert.equal(settled.data?.cancel?.kind, "paid-online");
});

/* --------------------------------------- committed, then the response is lost */

test("the cancel commits but the detail read fails: still 200 cancelled; the retry is 200 again and writes nothing twice", async () => {
  const stockBefore = await onHand();
  const couponsBefore = await redeemedCount();
  const o = await stockedOrder();
  assert.equal(await redeemedCount(), couponsBefore + 1);

  const res = await cancel(o.orderNo, nothingPaid, TOKEN_A, {
    readDetail: async () => {
      throw new Error("read timed out");
    },
  });
  assert.equal(res.status, 200, "the order WAS cancelled; the answer must say so");
  const b = await json(res);
  assert.deepEqual(b.data, { orderNo: o.orderNo, status: "cancelled" });
  assert.equal(await statusOf(o.id), "cancelled");
  assert.equal(await onHand(), stockBefore + 2, "stock returned once");
  assert.equal(await redeemedCount(), couponsBefore, "coupon use released once");
  assert.equal(await cancelEvents(o.id), 1);

  // The app never saw that answer and taps again.
  for (const attempt of [1, 2]) {
    const retry = await cancel(o.orderNo);
    assert.equal(retry.status, 200, `retry ${attempt} reports the committed outcome`);
    const r = await json(retry);
    assert.equal(r.data?.status, "cancelled");
    assert.equal(r.data?.alreadyCancelled, true);
    assert.equal(r.data?.cancel?.kind, "not-cancellable");
  }
  assert.equal(await cancelEvents(o.id), 1, "no second status event");
  assert.equal(await onHand(), stockBefore + 2, "no second restock");
  assert.equal(await redeemedCount(), couponsBefore, "no second coupon release");
  assert.equal(await db.couponRedemption.count({ where: { orderId: o.id } }), 0);
});

test("the cancel commits and the detail comes back empty: 200 with the minimal body", async () => {
  const o = await order("cod", "confirmed");
  const res = await cancel(o.orderNo, nothingPaid, TOKEN_A, { readDetail: async () => null });
  assert.equal(res.status, 200);
  assert.deepEqual((await json(res)).data, { orderNo: o.orderNo, status: "cancelled" });
  assert.equal(await statusOf(o.id), "cancelled");
});
