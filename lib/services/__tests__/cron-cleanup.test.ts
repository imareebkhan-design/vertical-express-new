/**
 * ISS-043 — the cleanup cron endpoint must not be publicly invocable.
 *
 * `/api/cron/cleanup-orders` cancels expired pending orders and returns their
 * stock to inventory. It shipped with no authentication of any kind, so anyone
 * who found the URL could mutate order and inventory state and hammer a
 * connection pool sized at 5.
 *
 * These tests drive the route handler directly, the same way
 * `webhook.test.ts` drives the Razorpay webhook.
 *
 * The cleanup logic itself is deliberately untouched by this change; the
 * idempotency and concurrency tests below assert the behaviour the existing
 * `cleanupExpiredPendingOrders` already has, so that the guard added here
 * cannot be mistaken for having changed it.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { GET } from "@/app/api/cron/cleanup-orders/route";

const CRON_SECRET = `test_cron_secret_${randomUUID()}`;
const ROUTE_URL = "http://localhost/api/cron/cleanup-orders";

const TEST_USER = randomUUID();
let warehouseId: string;
let variantId: string;
let productId: string;

/** Baseline stock, so a release is observable as an increment from a known value. */
const STOCK_BEFORE = 100;
const ORDER_QTY = 7;

const savedEnv: Record<string, string | undefined> = {};

function request(authorization?: string): NextRequest {
  return new NextRequest(ROUTE_URL, {
    headers: authorization ? { authorization } : {},
  });
}

/** A pending_payment order older than the 15-minute window, with one line. */
async function createStaleOrder(): Promise<string> {
  const order = await db.order.create({
    data: {
      orderNo: `TEST-CRON-${randomUUID().slice(0, 8)}`,
      userId: TEST_USER,
      address: {
        label: "Site",
        name: "Cron Fixture",
        phone: "+919999999999",
        line1: "Plot 1",
        city: "Srinagar",
        state: "Jammu & Kashmir",
        pincode: "190001",
      },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: 10000,
      totalPaise: 10000,
      warehouseId,
      // Comfortably past the hardcoded 15-minute expiry window.
      placedAt: new Date(Date.now() - 60 * 60 * 1000),
      items: {
        create: [
          {
            variantId,
            title: "Cron Fixture Product",
            variantName: "Default",
            unitPricePaise: 10000 / ORDER_QTY,
            qty: ORDER_QTY,
            lineTotalPaise: 10000,
          },
        ],
      },
    },
  });
  return order.id;
}

async function stockNow(): Promise<number> {
  const inv = await db.inventory.findFirst({ where: { variantId, warehouseId } });
  return inv?.qtyOnHand ?? -1;
}

/**
 * Full per-test reset.
 *
 * Orders are deleted as well as stock being restored, because the tests that
 * assert an unauthorised call changes nothing deliberately leave a stale order
 * behind. Without this, a later authorised run would sweep up every order the
 * earlier tests left — `cleanupExpiredPendingOrders` takes 20 at a time — and
 * the released quantity would depend on test execution order.
 */
async function resetFixture(): Promise<void> {
  await db.order.deleteMany({ where: { userId: TEST_USER } });
  await db.inventory.updateMany({
    where: { variantId, warehouseId },
    data: { qtyOnHand: STOCK_BEFORE },
  });
}

before(async () => {
  savedEnv.CRON_SECRET = process.env.CRON_SECRET;
  process.env.CRON_SECRET = CRON_SECRET;

  const category = await db.category.findFirst({ select: { id: true } });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!category || !brand) throw new Error("Seed must provide a category and a brand.");

  await db.user.create({
    data: {
      id: TEST_USER,
      phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: `cron_${randomUUID()}@example.com`,
    },
  });

  const wh = await db.warehouse.create({
    data: { name: "Cron Test Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = wh.id;

  const product = await db.product.create({
    data: {
      title: "Cron Fixture Product",
      slug: `cron-fixture-${Date.now()}`,
      description: "Fixture for ISS-043",
      categoryId: category.id,
      brandId: brand.id,
    },
  });
  productId = product.id;

  const variant = await db.productVariant.create({
    data: { productId, name: "Default", sku: `SKU-CRON-${Date.now()}`, pricePaise: 10000 },
  });
  variantId = variant.id;

  await db.inventory.create({
    data: { variantId, warehouseId, qtyOnHand: STOCK_BEFORE },
  });
});

after(async () => {
  process.env.CRON_SECRET = savedEnv.CRON_SECRET;
  await db.order.deleteMany({ where: { userId: TEST_USER } });
  await db.inventory.deleteMany({ where: { warehouseId } });
  await db.productVariant.deleteMany({ where: { productId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: TEST_USER } });
});

// --- ISS-043: authentication ------------------------------------------------

test("ISS-043 — no Authorization header is rejected and mutates nothing", async () => {
  await resetFixture();
  const orderId = await createStaleOrder();

  const res = await GET(request());

  assert.equal(res.status, 401);
  const order = await db.order.findUnique({ where: { id: orderId } });
  assert.equal(order?.status, "pending_payment", "an unauthorised call must not cancel");
  assert.equal(await stockNow(), STOCK_BEFORE, "an unauthorised call must not touch inventory");
});

test("ISS-043 — a wrong bearer token is rejected", async () => {
  await resetFixture();
  const orderId = await createStaleOrder();

  const res = await GET(request("Bearer not-the-real-secret"));

  assert.equal(res.status, 401);
  const order = await db.order.findUnique({ where: { id: orderId } });
  assert.equal(order?.status, "pending_payment");
});

test("ISS-043 — a correct secret with a malformed scheme is rejected", async () => {
  // The whole header is compared, so the bare secret without "Bearer " must fail.
  const res = await GET(request(CRON_SECRET));
  assert.equal(res.status, 401);
});

test("ISS-043 — an unset CRON_SECRET fails CLOSED, not open", async () => {
  await resetFixture();
  const orderId = await createStaleOrder();
  delete process.env.CRON_SECRET;

  try {
    const res = await GET(request(`Bearer ${CRON_SECRET}`));
    assert.equal(res.status, 401, "a missing secret must deny, never allow");
    const order = await db.order.findUnique({ where: { id: orderId } });
    assert.equal(order?.status, "pending_payment");
  } finally {
    process.env.CRON_SECRET = CRON_SECRET;
  }
});

// --- cleanup behaviour, preserved -------------------------------------------

test("ISS-043 — an authorised call cancels the stale order and releases its stock", async () => {
  await resetFixture();
  const orderId = await createStaleOrder();

  const res = await GET(request(`Bearer ${CRON_SECRET}`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.cancelledCount >= 1);

  const order = await db.order.findUnique({ where: { id: orderId } });
  assert.equal(order?.status, "cancelled");
  assert.match(order?.cancelledReason ?? "", /expired/i);

  const events = await db.orderStatusEvent.findMany({ where: { orderId } });
  assert.equal(events.length, 1, "exactly one status event per cancellation");
  assert.equal(events[0].toStatus, "cancelled");

  assert.equal(
    await stockNow(),
    STOCK_BEFORE + ORDER_QTY,
    "cancelling must return the ordered quantity to inventory"
  );
});

test("ISS-043 — a fresh order inside the window is left alone", async () => {
  await resetFixture();
  const fresh = await db.order.create({
    data: {
      orderNo: `TEST-CRON-FRESH-${randomUUID().slice(0, 8)}`,
      userId: TEST_USER,
      address: { label: "Site", name: "Fresh", phone: "+919999999999", line1: "1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: 10000,
      totalPaise: 10000,
      warehouseId,
      placedAt: new Date(),
    },
  });

  const res = await GET(request(`Bearer ${CRON_SECRET}`));
  assert.equal(res.status, 200);

  const order = await db.order.findUnique({ where: { id: fresh.id } });
  assert.equal(order?.status, "pending_payment", "an order inside the window must survive");
});

test("ISS-043 — repeated authorised runs are idempotent (stock released once)", async () => {
  await resetFixture();
  const orderId = await createStaleOrder();

  await GET(request(`Bearer ${CRON_SECRET}`));
  const afterFirst = await stockNow();

  await GET(request(`Bearer ${CRON_SECRET}`));
  const afterSecond = await stockNow();

  assert.equal(afterFirst, STOCK_BEFORE + ORDER_QTY);
  assert.equal(afterSecond, afterFirst, "a second run must not release the stock again");

  const events = await db.orderStatusEvent.findMany({ where: { orderId } });
  assert.equal(events.length, 1, "a second run must not write a second status event");
});

test("ISS-043 — concurrent authorised runs release stock exactly once", async () => {
  // Vercel documents that cron delivery can invoke the same scheduled run more
  // than once, so overlapping invocations are expected rather than exotic.
  await resetFixture();
  const orderId = await createStaleOrder();

  await Promise.all([
    GET(request(`Bearer ${CRON_SECRET}`)),
    GET(request(`Bearer ${CRON_SECRET}`)),
    GET(request(`Bearer ${CRON_SECRET}`)),
  ]);

  assert.equal(
    await stockNow(),
    STOCK_BEFORE + ORDER_QTY,
    "three concurrent runs must not multiply the released quantity"
  );

  const events = await db.orderStatusEvent.findMany({ where: { orderId } });
  assert.equal(events.length, 1, "exactly one cancellation event survives the race");
});
