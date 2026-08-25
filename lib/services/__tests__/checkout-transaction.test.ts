/**
 * ISS-003 — the payment gateway must not be called from inside the database
 * transaction.
 *
 * `placeOrder` used to call `provider.createOrder()` as the first statement inside
 * `db.$transaction(...)`. For Razorpay that is an outbound HTTPS request, so a
 * pooled database connection and an open transaction were held across arbitrary
 * network latency — the route to connection-pool exhaustion under concurrent
 * checkout, which takes down the whole application rather than just checkout.
 *
 * These tests exercise the real Razorpay provider with `fetch` stubbed, because
 * that is the only provider that performs I/O. `db.$transaction` is wrapped to
 * count open transactions, so the first test observes the exact property that was
 * violated: the depth at the moment the gateway is called.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem } from "../cart";
import { placeOrder } from "../checkout";

const TEST_PINCODE = "999903";
const TEST_USER = randomUUID();

let warehouseId: string;
let productId: string;
let variantId: string;
let addressId: string;

// --- transaction depth probe -------------------------------------------------

/**
 * `$transaction` is overloaded (array form and interactive-callback form), so the
 * probe is typed against a permissive call signature rather than reproducing the
 * overloads. Only the callback form is bracketed; the array form is passed through.
 */
type TransactionFn = (...args: unknown[]) => unknown;
type TransactionCallback = (tx: unknown) => Promise<unknown>;

const realTransaction = db.$transaction.bind(db) as unknown as TransactionFn;
let txnDepth = 0;

const countingTransaction: TransactionFn = (...args) => {
  const [first] = args;
  if (typeof first !== "function") {
    return realTransaction(...args);
  }
  const inner = first as TransactionCallback;
  const wrapped = async (tx: unknown) => {
    txnDepth += 1;
    try {
      return await inner(tx);
    } finally {
      txnDepth -= 1;
    }
  };
  return realTransaction(wrapped, ...args.slice(1));
};

// --- fetch stub --------------------------------------------------------------

const realFetch = globalThis.fetch;
let txnDepthAtGatewayCall: number | null = null;
let gatewayShouldFail = false;

function stubFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("api.razorpay.com")) {
      return realFetch(input as RequestInfo, init);
    }
    txnDepthAtGatewayCall = txnDepth;
    if (gatewayShouldFail) {
      return new Response("gateway down", { status: 502 });
    }
    return new Response(JSON.stringify({ id: `order_test_${randomUUID().slice(0, 8)}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

// --- fixtures ----------------------------------------------------------------

const savedEnv: Record<string, string | undefined> = {};

before(async () => {
  for (const k of ["PAYMENT_GATEWAY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
    savedEnv[k] = process.env[k];
  }
  process.env.PAYMENT_GATEWAY = "razorpay-test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_stub";
  process.env.RAZORPAY_KEY_SECRET = "stub_secret";

  stubFetch();
  db.$transaction = countingTransaction as unknown as typeof db.$transaction;

  const category = await db.category.findFirst({ select: { id: true } });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!category || !brand) {
    throw new Error("No categories/brands found in seed to attach test product to.");
  }

  await db.user.create({
    data: {
      id: TEST_USER,
      phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: `checkout_txn_${randomUUID()}@example.com`,
    },
  });

  const wh = await db.warehouse.create({
    data: { name: "Txn Test Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = wh.id;

  await db.serviceablePincode.create({
    data: { pincode: TEST_PINCODE, warehouseId, isActive: true, codAllowed: true },
  });

  const address = await db.address.create({
    data: {
      userId: TEST_USER,
      name: "Txn Buyer",
      phone: "9876543210",
      line1: "Plot 42",
      city: "Srinagar",
      state: "Jammu & Kashmir",
      pincode: TEST_PINCODE,
      isDefault: true,
    },
  });
  addressId = address.id;

  const product = await db.product.create({
    data: {
      title: "Txn Test Cement",
      slug: `txn-test-cement-${Date.now()}`,
      description: "Fixture for ISS-003",
      categoryId: category.id,
      brandId: brand.id,
    },
  });
  productId = product.id;

  const variant = await db.productVariant.create({
    data: { productId, name: "50kg Bag", sku: `SKU-TXN-${Date.now()}`, pricePaise: 46500 },
  });
  variantId = variant.id;

  await db.inventory.create({
    data: { variantId, warehouseId, qtyOnHand: 20 },
  });
});

after(async () => {
  globalThis.fetch = realFetch;
  db.$transaction = realTransaction as unknown as typeof db.$transaction;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  await db.orderItem.deleteMany({ where: { order: { userId: TEST_USER } } });
  await db.payment.deleteMany({ where: { order: { userId: TEST_USER } } });
  await db.orderStatusEvent.deleteMany({ where: { order: { userId: TEST_USER } } });
  await db.order.deleteMany({ where: { userId: TEST_USER } });
  await db.cartItem.deleteMany({ where: { cart: { userId: TEST_USER } } });
  await db.cart.deleteMany({ where: { userId: TEST_USER } });
  await db.address.deleteMany({ where: { userId: TEST_USER } });
  await db.serviceablePincode.deleteMany({ where: { pincode: TEST_PINCODE } });
  if (variantId) {
    await db.inventory.deleteMany({ where: { variantId } });
    await db.productVariant.delete({ where: { id: variantId } });
  }
  if (productId) await db.product.delete({ where: { id: productId } });
  if (warehouseId) await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: TEST_USER } });
});

// --- tests -------------------------------------------------------------------

test("ISS-003: the payment gateway is called outside the database transaction", async () => {
  gatewayShouldFail = false;
  txnDepthAtGatewayCall = null;

  await addItem(TEST_USER, null, variantId, 2);

  const result = await placeOrder({
    userId: TEST_USER,
    addressId,
    paymentMethod: "razorpay-test",
    idempotencyKey: `txn-probe-${randomUUID()}`,
  });

  assert.equal(
    txnDepthAtGatewayCall,
    0,
    "provider.createOrder ran with an open database transaction — an outbound HTTPS " +
      "request is holding a pooled connection (ISS-003)"
  );
  assert.ok(result.orderNo, "an order should still have been created");
  assert.equal(result.requiresPaymentConfirmation, true);
  assert.ok(result.gatewayOrderId?.startsWith("order_test_"));
});

test("ISS-003: a gateway failure leaves no order and no stock decrement", async () => {
  gatewayShouldFail = true;
  txnDepthAtGatewayCall = null;

  const before = await db.inventory.findFirstOrThrow({
    where: { variantId, warehouseId },
    select: { qtyOnHand: true },
  });
  const idempotencyKey = `txn-fail-${randomUUID()}`;

  await addItem(TEST_USER, null, variantId, 3);

  await assert.rejects(
    () =>
      placeOrder({
        userId: TEST_USER,
        addressId,
        paymentMethod: "razorpay-test",
        idempotencyKey,
      }),
    /RAZORPAY_ORDER_FAILED/,
    "a failing gateway should surface as an error, not a silent order"
  );

  const orphan = await db.order.findFirst({ where: { idempotencyKey, userId: TEST_USER } });
  assert.equal(orphan, null, "no order row should survive a gateway failure");

  const after = await db.inventory.findFirstOrThrow({
    where: { variantId, warehouseId },
    select: { qtyOnHand: true },
  });
  assert.equal(after.qtyOnHand, before.qtyOnHand, "stock must not move when the gateway fails");

  gatewayShouldFail = false;
});
