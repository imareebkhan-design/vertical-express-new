import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { cancelOrder, type CapturedLookup } from "../orders";
import { settleCapturedPayment, listCapturedPaymentsOnDeadOrders } from "../checkout";
import { redeemCoupon } from "../coupon-eligibility";
import { PaymentConfigError } from "../payments";

/**
 * E5 — "Cancel order" on an order whose payment confirmation was lost.
 *
 * The order reads `pending_payment` because the browser's confirmation never
 * reached us, but Razorpay may already hold or have taken the money. Cancelling
 * on the local status alone released the stock and the coupon use of a paid
 * order and left the customer's money against a cancelled one. The cancel now
 * asks Razorpay first (after the ownership check, outside any transaction):
 *
 *   captured at the order's amount -> settled, cancel refused (stock + coupon kept)
 *   authorized, capture pending    -> refused, nothing moves
 *   lookup failed / amount differs /
 *   no gateway configured          -> refused with retry guidance, nothing moves
 *   nothing captured               -> cancelled, stock and coupon released once
 *   no Razorpay order (COD etc.)   -> cancelled without asking, as before
 */

const USER = randomUUID();
const OTHER = randomUUID();
const TAG = randomUUID().slice(0, 8);
const STOCK = 100;
const QTY = 3;
const AMOUNT = 30000;
let warehouseId: string;
let variantId: string;
let productId: string;
let couponId: string;

async function pendingOrder(opts: { gatewayOrder?: boolean } = {}) {
  const gw = `order_${TAG}_${randomUUID().slice(0, 8)}`;
  const order = await db.order.create({
    data: {
      orderNo: `ZZZCXL-${TAG}-${randomUUID().slice(0, 6)}`,
      userId: USER,
      address: { label: "Site", name: "Cancel Fixture", phone: "+919999999999", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: AMOUNT,
      totalPaise: AMOUNT,
      couponCode: `ZZZCXL-${TAG}`,
      warehouseId,
      items: { create: [{ variantId, title: "Cancel Fixture", variantName: "Default", unitPricePaise: AMOUNT / QTY, qty: QTY, lineTotalPaise: AMOUNT }] },
      payments: {
        create: [{ gateway: "razorpay", amountPaise: AMOUNT, status: "created", ...(opts.gatewayOrder === false ? {} : { gatewayOrderId: gw }) }],
      },
    },
    include: { payments: true },
  });
  const r = await db.$transaction((tx) => redeemCoupon(tx, { couponId, userId: USER, orderId: order.id, discountPaise: 500 }));
  assert.equal(r.ok, true, "fixture coupon redeemed");
  return { id: order.id, orderNo: order.orderNo, gw, paymentId: order.payments[0].id };
}

const stock = async () =>
  (await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } })).qtyOnHand;

async function state(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true, statusEvents: true } });
  return {
    status: o.status,
    payment: o.payments[0].status,
    gatewayPaymentId: o.payments[0].gatewayPaymentId,
    cancelEvents: o.statusEvents.filter((e) => e.toStatus === "cancelled" && e.fromStatus === "pending_payment").length,
    confirmEvents: o.statusEvents.filter((e) => e.toStatus === "confirmed" && e.fromStatus === "pending_payment").length,
    redemptions: await db.couponRedemption.count({ where: { orderId } }),
  };
}
const redeemed = async () => (await db.coupon.findUniqueOrThrow({ where: { id: couponId } })).redeemedCount;

/** A lookup that records every question it was asked. */
function lookup(answer: CapturedLookup | null | Error | ((gw: string) => Promise<CapturedLookup | null>)) {
  const asked: string[] = [];
  const fn = async (gw: string) => {
    asked.push(gw);
    if (typeof answer === "function") return answer(gw);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fn, asked };
}

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  await db.user.createMany({ data: [{ id: USER }, { id: OTHER }] });
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ Cancel ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  const product = await db.product.create({
    data: {
      slug: `zzz-cancel-${TAG}`, title: "ZZZ Cancel Fixture", brandId: brand.id, categoryId: category.id,
      unitLabel: "per bag", status: "published",
      variants: { create: [{ sku: `ZZZ-CXL-${TAG}`, name: "Default", pricePaise: AMOUNT / QTY, isDefault: true }] },
    },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: STOCK } });
  couponId = (await db.coupon.create({ data: { code: `ZZZCXL-${TAG}`, type: "flat", value: 500, usageLimit: 1000, perUserLimit: 1000 } })).id;
});

after(async () => {
  const ids = (await db.order.findMany({ where: { userId: USER }, select: { id: true } })).map((o) => o.id);
  await db.couponRedemption.deleteMany({ where: { couponId } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: ids } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.coupon.deleteMany({ where: { id: couponId } });
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: { in: [USER, OTHER] } } });
});

test("1. lost callback, money already captured at Razorpay: cancel refused, order confirmed, stock and coupon kept", async () => {
  const o = await pendingOrder();
  const [s0, c0] = [await stock(), await redeemed()];
  const pay = `pay_${randomUUID().slice(0, 12)}`;
  const l = lookup({ gatewayPaymentId: pay, amountPaise: AMOUNT, status: "captured" });

  await assert.rejects(cancelOrder(USER, o.orderNo, "changed my mind", { findCaptured: l.fn }), /^Error: PAID_NOT_CANCELLABLE$/);

  const s = await state(o.id);
  assert.deepEqual(l.asked, [o.gw], "Razorpay was asked about this order's Razorpay order");
  assert.equal(s.status, "confirmed", "reconciled through the settlement service");
  assert.equal(s.payment, "captured");
  assert.equal(s.gatewayPaymentId, pay);
  assert.equal(s.confirmEvents, 1);
  assert.equal(s.cancelEvents, 0);
  const note = (await db.orderStatusEvent.findFirstOrThrow({ where: { orderId: o.id, toStatus: "confirmed" } })).note;
  assert.match(note ?? "", /asked to cancel/, "the audit trail says how it was found");
  assert.equal(await stock(), s0, "stock of a paid order is not released");
  assert.equal(s.redemptions, 1, "coupon use kept");
  assert.equal(await redeemed(), c0);
});

test("2. funds authorized but not captured: cancel refused, nothing moves, nothing settled", async () => {
  const o = await pendingOrder();
  const [s0, c0] = [await stock(), await redeemed()];
  const l = lookup({ gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`, amountPaise: AMOUNT, status: "authorized" });

  await assert.rejects(cancelOrder(USER, o.orderNo, "x", { findCaptured: l.fn }), /^Error: PAYMENT_IN_PROGRESS$/);

  const s = await state(o.id);
  assert.equal(s.status, "pending_payment");
  assert.equal(s.payment, "created", "an authorization is not recorded as a capture");
  assert.equal(await stock(), s0);
  assert.equal(s.redemptions, 1);
  assert.equal(await redeemed(), c0);
});

test("3. lookup failure, timeout, amount mismatch, or no gateway configured: refused with retry guidance, nothing moves", async () => {
  const cases: [string, ReturnType<typeof lookup>][] = [
    ["lookup failed", lookup(new Error("RAZORPAY_LOOKUP_FAILED:503"))],
    ["timed out", lookup(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }))],
    ["amount differs", lookup({ gatewayPaymentId: `pay_${randomUUID().slice(0, 8)}`, amountPaise: AMOUNT - 100, status: "captured" })],
    ["no gateway configured", lookup(new PaymentConfigError("RAZORPAY_NOT_ACTIVE"))],
  ];
  for (const [name, l] of cases) {
    const o = await pendingOrder();
    const [s0, c0] = [await stock(), await redeemed()];
    await assert.rejects(cancelOrder(USER, o.orderNo, "x", { findCaptured: l.fn }), /^Error: PAYMENT_STATUS_UNKNOWN$/, name);
    const s = await state(o.id);
    assert.equal(s.status, "pending_payment", `${name}: not cancelled`);
    assert.equal(s.payment, "created", `${name}: nothing settled`);
    assert.equal(await stock(), s0, `${name}: stock not released`);
    assert.equal(s.redemptions, 1, `${name}: coupon kept`);
    assert.equal(await redeemed(), c0, `${name}: coupon counter kept`);
  }
});

test("4. genuinely unpaid: cancelled, stock and coupon use released exactly once", async () => {
  const o = await pendingOrder();
  const [s0, c0] = [await stock(), await redeemed()];
  const l = lookup(null);
  await cancelOrder(USER, o.orderNo, "changed my mind", { findCaptured: l.fn });

  const s = await state(o.id);
  assert.deepEqual(l.asked, [o.gw]);
  assert.equal(s.status, "cancelled");
  assert.equal(s.cancelEvents, 1);
  assert.equal(await stock(), s0 + QTY);
  assert.equal(s.redemptions, 0);
  assert.equal(await redeemed(), c0 - 1);

  await assert.rejects(cancelOrder(USER, o.orderNo, "again", { findCaptured: l.fn }), /NOT_CANCELLABLE/);
  assert.equal(await stock(), s0 + QTY, "a second cancel releases nothing more");
  assert.equal(await redeemed(), c0 - 1);
  assert.equal(l.asked.length, 1, "a cancelled order is not looked up again");
});

test("4b. no Razorpay order to ask about (e.g. the gateway order was never created): cancels as before, without asking", async () => {
  const o = await pendingOrder({ gatewayOrder: false });
  const s0 = await stock();
  const l = lookup(new Error("must not be called"));
  await cancelOrder(USER, o.orderNo, "x", { findCaptured: l.fn });
  assert.equal(l.asked.length, 0);
  assert.equal((await state(o.id)).status, "cancelled");
  assert.equal(await stock(), s0 + QTY);
});

test("5a. a settlement that commits after the lookup but before the cancel: the cancel loses the row, nothing released", async () => {
  const o = await pendingOrder();
  const [s0, c0] = [await stock(), await redeemed()];
  const pay = `pay_${randomUUID().slice(0, 12)}`;
  const l = lookup(async () => {
    /* Razorpay said "nothing yet"; the webhook lands before our transaction. */
    await settleCapturedPayment({ paymentId: o.paymentId, orderId: o.id, orderNo: o.orderNo, amountPaise: AMOUNT, gatewayPaymentId: pay, source: "webhook" });
    return null;
  });
  /* The compare-and-set in the cancel transaction is what protects this window. */
  await assert.rejects(cancelOrder(USER, o.orderNo, "x", { findCaptured: l.fn }), /^Error: NOT_CANCELLABLE$/);
  const s = await state(o.id);
  assert.equal(s.status, "confirmed");
  assert.equal(await stock(), s0);
  assert.equal(s.redemptions, 1);
  assert.equal(await redeemed(), c0);
});

test("5b. cancel and settlement truly concurrent: one wins; stock, coupon and money stay consistent", async () => {
  for (let i = 0; i < 6; i++) {
    const o = await pendingOrder();
    const [s0, c0] = [await stock(), await redeemed()];
    const pay = `pay_${randomUUID().slice(0, 12)}`;
    const [cancelled, settled] = await Promise.all([
      cancelOrder(USER, o.orderNo, "race", { findCaptured: async () => null }).then(() => "ok", (e: Error) => e.message),
      settleCapturedPayment({ paymentId: o.paymentId, orderId: o.id, orderNo: o.orderNo, amountPaise: AMOUNT, gatewayPaymentId: pay, source: "webhook" }),
    ]);
    const s = await state(o.id);
    assert.equal(s.payment, "captured", `run ${i}: the money is always recorded`);
    if (s.status === "confirmed") {
      /* Refused either by its own paid check (settlement committed before the
         cancel read the order) or by losing the compare-and-set (after). */
      assert.match(cancelled, /^(PAID_)?NOT_CANCELLABLE$/, `run ${i}: the cancel was refused`);
      assert.equal(settled, "confirmed");
      assert.equal(await stock(), s0, `run ${i}: nothing released`);
      assert.equal(await redeemed(), c0);
    } else {
      /* The cancel committed first: the capture is the residual race — recorded
         as late, on the refund worklist, order not revived. */
      assert.equal(s.status, "cancelled", `run ${i}`);
      assert.equal(cancelled, "ok");
      assert.equal(settled, "late_recorded");
      assert.equal(await stock(), s0 + QTY, `run ${i}: released once`);
      assert.equal(await redeemed(), c0 - 1, `run ${i}: coupon released once`);
      assert.ok((await listCapturedPaymentsOnDeadOrders()).some((w) => w.order.orderNo === o.orderNo), `run ${i}: on the refund worklist`);
    }
    assert.equal(s.cancelEvents + s.confirmEvents, 1, `run ${i}: exactly one transition`);
  }
});

test("5c. two cancels at once on a genuinely unpaid order: one succeeds, stock and coupon released once", async () => {
  for (let i = 0; i < 4; i++) {
    const o = await pendingOrder();
    const [s0, c0] = [await stock(), await redeemed()];
    const run = () => cancelOrder(USER, o.orderNo, "dup", { findCaptured: async () => null }).then(() => "ok", (e: Error) => e.message);
    const results = (await Promise.all([run(), run()])).sort();
    assert.deepEqual(results, ["NOT_CANCELLABLE", "ok"], `run ${i}`);
    assert.equal(await stock(), s0 + QTY, `run ${i}: stock released once`);
    assert.equal(await redeemed(), c0 - 1, `run ${i}: coupon released once`);
    assert.equal((await state(o.id)).cancelEvents, 1);
  }
});

test("7. another customer's order: not found, and Razorpay is never asked", async () => {
  const o = await pendingOrder();
  const l = lookup(null);
  await assert.rejects(cancelOrder(OTHER, o.orderNo, "x", { findCaptured: l.fn }), /^Error: NOT_FOUND$/);
  assert.equal(l.asked.length, 0, "ownership is checked before any gateway call");
  assert.equal((await state(o.id)).status, "pending_payment");
});
