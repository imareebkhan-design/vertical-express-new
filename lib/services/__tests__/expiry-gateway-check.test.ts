import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { cleanupExpiredPendingOrders, type CapturedLookup } from "../orders";
import { getPaymentProvider, PaymentConfigError } from "../payments";
import { redeemCoupon } from "../coupon-eligibility";

/**
 * ISS-074 — the payment-window expiry must ask the gateway before cancelling.
 *
 * It used to cancel every `pending_payment` order older than 15 minutes on the
 * local status alone. A customer who paid near the end of the window, whose
 * browser callback was lost and whose webhook was late, had the order cancelled
 * and its stock released although Razorpay had captured the money — a late
 * capture, and a manual refund, for a payment that was on time.
 *
 * The expiry now looks the gateway order up first:
 *   captured, right amount   → settled as confirmed (not cancelled, stock kept)
 *   captured, wrong amount   → left alone and alerted (never settled, never cancelled)
 *   nothing captured         → cancelled and stock released, as before
 *   lookup failed            → left for the next run (never cancel on missing information)
 *   no gateway in this process (PaymentConfigError) → cancelled as before
 */

const USER = randomUUID();
const TAG = randomUUID().slice(0, 8);
const STOCK = 100;
const QTY = 7;
const AMOUNT = 10000;
let warehouseId: string;
let variantId: string;
let productId: string;

async function staleOrder(gatewayOrderId: string) {
  return db.order.create({
    data: {
      orderNo: `ZZZ-EXP-${TAG}-${randomUUID().slice(0, 6)}`,
      userId: USER,
      address: { label: "Site", name: "Expiry Fixture", phone: "+919999999999", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: AMOUNT,
      totalPaise: AMOUNT,
      warehouseId,
      placedAt: new Date(Date.now() - 60 * 60 * 1000),
      items: { create: [{ variantId, title: "Expiry Fixture", variantName: "Default", unitPricePaise: 1000, qty: QTY, lineTotalPaise: AMOUNT }] },
      payments: { create: [{ gateway: "razorpay", amountPaise: AMOUNT, status: "created", gatewayOrderId }] },
    },
    include: { payments: true },
  });
}

const stock = async () =>
  (await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } })).qtyOnHand;

/** A lookup that answers only for this file's gateway orders; everything else is "nothing captured". */
function lookupFor(answers: Record<string, CapturedLookup | null | Error>) {
  return async (gatewayOrderId: string) => {
    const a = answers[gatewayOrderId];
    if (a instanceof Error) throw a;
    return a ?? null;
  };
}

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  await db.user.create({ data: { id: USER } });
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ Expiry ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  const product = await db.product.create({
    data: {
      slug: `zzz-expiry-${TAG}`, title: "ZZZ Expiry Fixture", brandId: brand.id, categoryId: category.id,
      unitLabel: "per bag", status: "published",
      variants: { create: [{ sku: `ZZZ-EXP-${TAG}`, name: "Default", pricePaise: 1000, isDefault: true }] },
    },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: STOCK } });
});

beforeEach(async () => {
  await cleanupOrders();
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: STOCK } });
});

async function cleanupOrders() {
  const ids = (await db.order.findMany({ where: { userId: USER }, select: { id: true } })).map((o) => o.id);
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: ids } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
}

after(async () => {
  await cleanupOrders();
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: USER } });
});

test("a payment Razorpay captured before the window closed confirms the order instead of cancelling it", async () => {
  const gw = `order_${TAG}_paid`;
  const o = await staleOrder(gw);
  await cleanupExpiredPendingOrders(15, { findCaptured: lookupFor({ [gw]: { gatewayPaymentId: `pay_${TAG}`, amountPaise: AMOUNT } }) });

  const after = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } });
  assert.equal(after.status, "confirmed", "a paid order was cancelled");
  assert.equal(after.payments[0].status, "captured");
  assert.equal(after.payments[0].gatewayPaymentId, `pay_${TAG}`);
  assert.equal(await stock(), STOCK, "the stock of a paid order was released");
  const events = await db.orderStatusEvent.findMany({ where: { orderId: o.id } });
  assert.deepEqual(events.map((e) => e.toStatus), ["confirmed"], "exactly one transition, to confirmed");
});

test("nothing captured: the order is cancelled and its stock released, as before", async () => {
  const gw = `order_${TAG}_unpaid`;
  const o = await staleOrder(gw);
  await cleanupExpiredPendingOrders(15, { findCaptured: lookupFor({ [gw]: null }) });

  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "cancelled");
  assert.equal(await stock(), STOCK + QTY, "stock was not released");
});

test("a failed lookup leaves the order for the next run — never cancel on missing information", async () => {
  const gw = `order_${TAG}_lookupfail`;
  const o = await staleOrder(gw);
  await cleanupExpiredPendingOrders(15, { findCaptured: lookupFor({ [gw]: new Error("RAZORPAY_LOOKUP_FAILED:503") }) });

  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "pending_payment");
  assert.equal(await stock(), STOCK, "stock moved on a failed lookup");
});

test("a captured amount that does not match is neither settled nor cancelled", async () => {
  const gw = `order_${TAG}_mismatch`;
  const o = await staleOrder(gw);
  await cleanupExpiredPendingOrders(15, { findCaptured: lookupFor({ [gw]: { gatewayPaymentId: `pay_${TAG}_x`, amountPaise: AMOUNT - 1 } }) });

  const after = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } });
  assert.equal(after.status, "pending_payment");
  assert.notEqual(after.payments[0].status, "captured", "a mismatched amount was recorded as captured");
  assert.equal(await stock(), STOCK);
});

test("an authorized payment awaiting capture is not expired: money is held, the order waits", async () => {
  const gw = `order_${TAG}_authorized`;
  const o = await staleOrder(gw);
  await cleanupExpiredPendingOrders(15, {
    findCaptured: lookupFor({ [gw]: { gatewayPaymentId: `pay_${TAG}_auth`, amountPaise: AMOUNT, status: "authorized" } }),
  });
  const after = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } });
  assert.equal(after.status, "pending_payment");
  assert.notEqual(after.payments[0].status, "captured", "an authorization is not recorded as a capture");
  assert.equal(await stock(), STOCK, "stock of held-money order not released");
});

test("a Razorpay order this process cannot ask about is left pending, not expired (E5)", async () => {
  /* Was "expiry cancels as it always did". The customer's cancel already
     refused this case; expiry now holds the same rule: a Razorpay order may be
     paid, and "cannot ask" is not "unpaid". */
  const gw = `order_${TAG}_nogateway`;
  const o = await staleOrder(gw);
  await cleanupExpiredPendingOrders(15, {
    findCaptured: lookupFor({ [gw]: new PaymentConfigError("RAZORPAY_NOT_ACTIVE") }),
  });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "pending_payment");
  assert.equal(await stock(), STOCK, "stock not released");
});

test("real expiry service, Razorpay keys missing: order, stock, coupon use and events unchanged; an actionable alert without secrets", async () => {
  /* No injected lookup: the expiry asks the real provider, which fails on
     genuinely missing configuration (razorpay-test active, keys absent). */
  const gw = `order_${TAG}_realcfg`;
  const o = await staleOrder(gw);
  const coupon = await db.coupon.create({ data: { code: `ZZZEXPCFG-${TAG}`, type: "flat", value: 500, usageLimit: 10, perUserLimit: 10 } });
  const redeemed = await db.$transaction((tx) => redeemCoupon(tx, { couponId: coupon.id, userId: USER, orderId: o.id, discountPaise: 500 }));
  assert.equal(redeemed.ok, true);
  const eventsBefore = await db.orderStatusEvent.count({ where: { orderId: o.id } });
  const couponBefore = (await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redeemedCount;

  const saved = { gw: process.env.PAYMENT_GATEWAY, id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  const logged: string[] = [];
  const realError = console.error;
  process.env.PAYMENT_GATEWAY = "razorpay-test";
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
  try {
    await cleanupExpiredPendingOrders(15);
  } finally {
    console.error = realError;
    for (const [k, v] of [["PAYMENT_GATEWAY", saved.gw], ["RAZORPAY_KEY_ID", saved.id], ["RAZORPAY_KEY_SECRET", saved.secret]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  try {
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } });
    assert.equal(after.status, "pending_payment", "not expired");
    assert.equal(after.payments[0].status, "created", "nothing settled");
    assert.equal(await stock(), STOCK, "stock not released");
    assert.equal(await db.couponRedemption.count({ where: { orderId: o.id } }), 1, "coupon use kept");
    assert.equal((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redeemedCount, couponBefore, "coupon counter kept");
    assert.equal(await db.orderStatusEvent.count({ where: { orderId: o.id } }), eventsBefore, "no status event");

    const alert = logged.find((l) => l.includes("expiry_gateway_unconfigured") && l.includes(o.orderNo));
    assert.ok(alert, `an expiry_gateway_unconfigured alert names the order: ${logged.join("\n")}`);
    assert.match(alert!, /RAZORPAY_KEYS_MISSING/, "says what is wrong");
    assert.doesNotMatch(alert!, /fixture-secret|rzp_(test|live)_[A-Za-z0-9]/, "no key material");
  } finally {
    await db.couponRedemption.deleteMany({ where: { couponId: coupon.id } });
    await db.coupon.delete({ where: { id: coupon.id } });
  }
});

test("an order with no Razorpay payment row still expires (nothing to ask about)", async () => {
  const o = await db.order.create({
    data: {
      orderNo: `ZZZ-EXP-${TAG}-norzp`,
      userId: USER,
      address: { label: "Site", name: "Expiry Fixture", phone: "+919999999999", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: AMOUNT,
      totalPaise: AMOUNT,
      warehouseId,
      placedAt: new Date(Date.now() - 60 * 60 * 1000),
      items: { create: [{ variantId, title: "Expiry Fixture", variantName: "Default", unitPricePaise: 1000, qty: QTY, lineTotalPaise: AMOUNT }] },
      payments: { create: [{ gateway: "dummy", amountPaise: AMOUNT, status: "created", gatewayOrderId: `dummy_${randomUUID()}` }] },
    },
  });
  await cleanupExpiredPendingOrders(15, { findCaptured: async () => { throw new Error("must not be asked"); } });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "cancelled");
  assert.equal(await stock(), STOCK + QTY, "stock released once");
});

test("the Razorpay lookup returns the captured payment of the order, and throws on an unreadable answer", async () => {
  const saved = { gw: process.env.PAYMENT_GATEWAY, id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET, fetch: globalThis.fetch };
  process.env.PAYMENT_GATEWAY = "razorpay-test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
  process.env.RAZORPAY_KEY_SECRET = "fixture-secret-not-real";
  const calls: string[] = [];
  try {
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ items: [
        { id: "pay_failed", status: "failed", amount: AMOUNT },
        { id: "pay_ok", status: "captured", amount: AMOUNT },
      ] }), { status: 200 });
    }) as typeof fetch;
    const provider = getPaymentProvider("razorpay");
    assert.deepEqual(await provider.findCapturedPayment("order_abc"), { gatewayPaymentId: "pay_ok", amountPaise: AMOUNT, status: "captured" });
    assert.equal(calls[0], "https://api.razorpay.com/v1/orders/order_abc/payments");

    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ id: "pay_x", status: "failed", amount: AMOUNT }] }), { status: 200 })) as typeof fetch;
    assert.equal(await provider.findCapturedPayment("order_abc"), null, "a failed attempt is not a capture");

    /* E5: held money is reported as held, never as "nothing" — and a capture wins. */
    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ id: "pay_auth", status: "authorized", amount: AMOUNT }] }), { status: 200 })) as typeof fetch;
    assert.deepEqual(await provider.findCapturedPayment("order_abc"), { gatewayPaymentId: "pay_auth", amountPaise: AMOUNT, status: "authorized" });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ items: [{ id: "pay_auth", status: "authorized", amount: AMOUNT }, { id: "pay_cap", status: "captured", amount: AMOUNT }] }), { status: 200 })) as typeof fetch;
    assert.equal((await provider.findCapturedPayment("order_abc"))?.gatewayPaymentId, "pay_cap");

    globalThis.fetch = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    await assert.rejects(provider.findCapturedPayment("order_abc"), /RAZORPAY_LOOKUP_FAILED:503/);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [["PAYMENT_GATEWAY", saved.gw], ["RAZORPAY_KEY_ID", saved.id], ["RAZORPAY_KEY_SECRET", saved.secret]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
