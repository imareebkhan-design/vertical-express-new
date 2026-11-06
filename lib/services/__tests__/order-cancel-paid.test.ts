/**
 * Customer cancellation must not cancel a paid order — W-01, docs/WEB_APP_AUDIT.md.
 *
 * `cancelOrder` used to cancel any `confirmed` order and restock it. An online
 * order is only `confirmed` once its payment is captured, and nothing refunds
 * a payment (the refund edge is unreachable by design until the owner sets a
 * policy — lib/order-flow.ts, ISS-025). So a customer who cancelled a paid order
 * lost the order and kept the charge.
 *
 * Two guarantees are pinned here, and they are different:
 *   1. Funds already recorded or held block customer cancellation, and the
 *      refusal changes nothing — including when the payment commits while the
 *      cancellation is in flight.
 *   2. A capture that lands AFTER an unpaid cancellation is recorded through
 *      the existing late-payment path (order stays cancelled, flagged for a
 *      human). That is not a refund; no test claims one.
 *
 * Interleavings are forced, not timed: a separate transaction holds the order
 * row FOR UPDATE, each real service call is started and confirmed (via
 * pg_stat_activity) to be queued on that row in a known order, then the lock
 * is released. Postgres grants queued row-lock waiters in arrival order.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { cancelOrder, cleanupExpiredPendingOrders } from "../orders";
import { settleCapturedPayment, listCapturedPaymentsOnDeadOrders } from "../checkout";

const USER = randomUUID();
const TAG = `CXL${Date.now() % 1_000_000}`;
let warehouseId: string;
let variantId: string;
let productId: string;

const ADDRESS = { label: "site", name: "Cancel Test", phone: "9876543210", line1: "Plot 1", line2: null, landmark: null, city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" };

type PayStatus = "created" | "authorized" | "captured" | "failed";

async function makeOrder(opts: {
  suffix: string;
  status: "pending_payment" | "confirmed" | "packed";
  paymentMethod: "razorpay" | "cod" | "dummy";
  /** Oldest first. */
  payments?: PayStatus[];
  placedAt?: Date;
}) {
  const order = await db.order.create({
    data: {
      orderNo: `${TAG}-${opts.suffix}`,
      userId: USER,
      address: ADDRESS,
      status: opts.status,
      paymentMethod: opts.paymentMethod,
      subtotalPaise: 10000,
      totalPaise: 10000,
      warehouseId,
      ...(opts.placedAt ? { placedAt: opts.placedAt } : {}),
      items: {
        create: { variantId, title: "Cancel Test Item", variantName: "Unit", unitPricePaise: 5000, qty: 2, lineTotalPaise: 10000 },
      },
    },
  });
  const paymentIds: string[] = [];
  for (const [i, status] of (opts.payments ?? []).entries()) {
    const p = await db.payment.create({
      data: {
        orderId: order.id,
        gateway: opts.paymentMethod,
        amountPaise: 10000,
        status,
        createdAt: new Date(Date.now() - (60 - i) * 1000),
      },
    });
    paymentIds.push(p.id);
  }
  return { ...order, paymentIds };
}

async function stock() {
  return (await db.inventory.findFirst({ where: { variantId, warehouseId } }))?.qtyOnHand ?? 0;
}

async function events(orderId: string) {
  return db.orderStatusEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
}

async function snapshot(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "asc" } } } });
  return {
    status: o.status,
    cancelledReason: o.cancelledReason,
    payments: o.payments.map((p) => p.status),
    events: (await events(orderId)).length,
    stock: await stock(),
  };
}

/* ---------------------------------------------------------------- barrier */

async function holdRowLock(orderId: string) {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  let lockedResolve!: (pid: number) => void;
  const locked = new Promise<number>((r) => (lockedResolve = r));
  const done = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      lockedResolve(pid);
      await gate;
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
  const holderPid = await locked;
  return {
    holderPid,
    release: async () => {
      open();
      await done;
    },
  };
}

/** Waits until `n` backends are queued behind the holder's row lock on `orders`. */
async function waitForQueued(holderPid: number, n: number) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const rows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> ${holderPid}
        AND wait_event_type = 'Lock'
        AND query ILIKE '%orders%'`;
    if (Number(rows[0].count) >= n) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${n} queued writers (have ${rows[0].count})`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function settle(order: { id: string; orderNo: string; paymentIds: string[] }) {
  return settleCapturedPayment({
    paymentId: order.paymentIds[order.paymentIds.length - 1],
    orderId: order.id,
    orderNo: order.orderNo,
    amountPaise: 10000,
    gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`,
    source: "webhook",
  });
}

/* ---------------------------------------------------------------- fixture */

before(async () => {
  const category = await db.category.findFirst({ select: { id: true } });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!category || !brand) throw new Error("Seed must provide a category and a brand.");

  await db.user.create({ data: { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` } });
  const wh = await db.warehouse.create({ data: { name: `Cancel Test WH ${TAG}`, city: "Srinagar", pincode: "190001" } });
  warehouseId = wh.id;
  const product = await db.product.create({
    data: { title: "Cancel Test Item", slug: `cancel-test-${TAG.toLowerCase()}`, categoryId: category.id, brandId: brand.id },
  });
  productId = product.id;
  const variant = await db.productVariant.create({ data: { productId, name: "Unit", sku: `SKU-${TAG}`, pricePaise: 5000 } });
  variantId = variant.id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 100 } });
});

after(async () => {
  await db.orderStatusEvent.deleteMany({ where: { order: { userId: USER } } });
  await db.payment.deleteMany({ where: { order: { userId: USER } } });
  await db.orderItem.deleteMany({ where: { order: { userId: USER } } });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: USER } });
});

/* ------------------------------------------------ funds recorded or held */

test("a confirmed order paid online is refused, and nothing moves", async () => {
  const order = await makeOrder({ suffix: "PAID", status: "confirmed", paymentMethod: "razorpay", payments: ["captured"] });
  const before = await snapshot(order.id);
  await assert.rejects(cancelOrder(USER, order.orderNo, "test"), /PAID_NOT_CANCELLABLE/);
  assert.deepEqual(await snapshot(order.id), before, "status, payments, events and stock unchanged");
});

test("a pending order with a captured or authorized payment is refused", async () => {
  const captured = await makeOrder({ suffix: "CAP", status: "pending_payment", paymentMethod: "razorpay", payments: ["captured"] });
  await assert.rejects(cancelOrder(USER, captured.orderNo, "test"), /PAID_NOT_CANCELLABLE/);
  const held = await makeOrder({ suffix: "AUTH", status: "pending_payment", paymentMethod: "razorpay", payments: ["authorized"] });
  const before = await snapshot(held.id);
  await assert.rejects(cancelOrder(USER, held.orderNo, "test"), /PAID_NOT_CANCELLABLE/);
  assert.deepEqual(await snapshot(held.id), before);
});

test("an earlier successful payment is not hidden by newer failed retries", async () => {
  const order = await makeOrder({ suffix: "RETRY", status: "pending_payment", paymentMethod: "razorpay", payments: ["captured", "failed", "failed"] });
  const before = await snapshot(order.id);
  await assert.rejects(cancelOrder(USER, order.orderNo, "test"), /PAID_NOT_CANCELLABLE/);
  assert.deepEqual(await snapshot(order.id), before);
});

test("a captured payment row wins over a cash-on-delivery label", async () => {
  const order = await makeOrder({ suffix: "CODCAP", status: "confirmed", paymentMethod: "cod", payments: ["captured"] });
  await assert.rejects(cancelOrder(USER, order.orderNo, "test"), /PAID_NOT_CANCELLABLE/);
});

/* ------------------------------------------------------- unpaid orders */

test("an unpaid online order cancels: status, one event, stock released once", async () => {
  const order = await makeOrder({ suffix: "UNPAID", status: "pending_payment", paymentMethod: "razorpay", payments: ["created", "failed"] });
  const before = await stock();
  await cancelOrder(USER, order.orderNo, "changed my mind");
  const after = await snapshot(order.id);
  assert.equal(after.status, "cancelled");
  assert.equal(after.cancelledReason, "changed my mind");
  assert.equal(after.events, 1);
  assert.equal(after.stock, before + 2);
  assert.deepEqual(after.payments, ["created", "failed"], "payment rows untouched");
});

test("a confirmed cash-on-delivery order with no funds cancels", async () => {
  const order = await makeOrder({ suffix: "COD", status: "confirmed", paymentMethod: "cod", payments: ["created"] });
  await cancelOrder(USER, order.orderNo, "not needed");
  assert.equal((await snapshot(order.id)).status, "cancelled");
});

test("cancelling twice releases stock once and writes one event", async () => {
  const order = await makeOrder({ suffix: "TWICE", status: "pending_payment", paymentMethod: "razorpay", payments: ["created"] });
  const before = await stock();
  await cancelOrder(USER, order.orderNo, "first");
  await assert.rejects(cancelOrder(USER, order.orderNo, "second"), /NOT_CANCELLABLE/);
  const s = await snapshot(order.id);
  assert.equal(s.events, 1);
  assert.equal(s.stock, before + 2);
  assert.equal(s.cancelledReason, "first");
});

test("past confirmed is refused as not cancellable", async () => {
  const order = await makeOrder({ suffix: "PACKED", status: "packed", paymentMethod: "cod" });
  await assert.rejects(cancelOrder(USER, order.orderNo, "test"), /NOT_CANCELLABLE/);
});

test("another customer's order is not found, and untouched", async () => {
  const order = await makeOrder({ suffix: "OWN", status: "pending_payment", paymentMethod: "razorpay", payments: ["created"] });
  const before = await snapshot(order.id);
  await assert.rejects(cancelOrder(randomUUID(), order.orderNo, "test"), /NOT_FOUND/);
  assert.deepEqual(await snapshot(order.id), before);
});

/* ------------------------------------------------------- interleavings */

test("settlement commits first while a cancel is in flight: cancel refused, nothing of it applied", async () => {
  const order = await makeOrder({ suffix: "RACE-SETTLE", status: "pending_payment", paymentMethod: "razorpay", payments: ["created"] });
  const stockBefore = await stock();
  const lock = await holdRowLock(order.id);

  const settling = settle(order);
  await waitForQueued(lock.holderPid, 1);
  /* The cancel's own read happens now, while the order is still pending and
     unpaid — it passes that check and queues its write behind the settlement. */
  const cancelling = cancelOrder(USER, order.orderNo, "race");
  const cancelSettled = cancelling.then(() => "resolved", (e: Error) => e.message);
  await waitForQueued(lock.holderPid, 2);
  await lock.release();

  assert.equal(await settling, "confirmed");
  assert.equal(await cancelSettled, "NOT_CANCELLABLE");
  const s = await snapshot(order.id);
  assert.equal(s.status, "confirmed", "the paid order stays confirmed");
  assert.deepEqual(s.payments, ["captured"]);
  assert.equal(s.stock, stockBefore, "no stock released");
  const ev = await events(order.id);
  assert.deepEqual(ev.map((e) => e.toStatus), ["confirmed"], "no cancellation event");
});

test("cancel commits first, capture arrives after: recorded as late, order not resurrected, stock released once", async () => {
  const order = await makeOrder({ suffix: "RACE-CANCEL", status: "pending_payment", paymentMethod: "razorpay", payments: ["created"] });
  const stockBefore = await stock();
  const lock = await holdRowLock(order.id);

  const cancelling = cancelOrder(USER, order.orderNo, "race");
  await waitForQueued(lock.holderPid, 1);
  const settling = settle(order);
  await waitForQueued(lock.holderPid, 2);
  await lock.release();

  await cancelling;
  assert.equal(await settling, "late_recorded");
  const s = await snapshot(order.id);
  assert.equal(s.status, "cancelled", "a late capture does not resurrect the order");
  assert.deepEqual(s.payments, ["captured"], "the money is recorded, not dropped");
  assert.equal(s.stock, stockBefore + 2, "stock released exactly once");
  const notes = (await events(order.id)).map((e) => e.note ?? "");
  assert.equal(notes.length, 2);
  assert.match(notes[1], /after this order expired/i);
  const worklist = await listCapturedPaymentsOnDeadOrders();
  assert.ok(worklist.some((p) => p.order.orderNo === order.orderNo), "it appears on the refund-required worklist");
});

test("two cancels racing: one wins, stock released once, one event", async () => {
  const order = await makeOrder({ suffix: "RACE-DUP", status: "pending_payment", paymentMethod: "razorpay", payments: ["created"] });
  const stockBefore = await stock();
  const lock = await holdRowLock(order.id);

  const a = cancelOrder(USER, order.orderNo, "a").then(() => "ok", (e: Error) => e.message);
  await waitForQueued(lock.holderPid, 1);
  const b = cancelOrder(USER, order.orderNo, "b").then(() => "ok", (e: Error) => e.message);
  await waitForQueued(lock.holderPid, 2);
  await lock.release();

  assert.deepEqual([await a, await b], ["ok", "NOT_CANCELLABLE"]);
  const s = await snapshot(order.id);
  assert.equal(s.events, 1);
  assert.equal(s.stock, stockBefore + 2);
});

test("cancel racing the expiry cron: exactly one cancellation, stock released once", async () => {
  const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  for (const [suffix, cancelFirst] of [["RACE-EXP-A", true], ["RACE-EXP-B", false]] as const) {
    const order = await makeOrder({ suffix, status: "pending_payment", paymentMethod: "razorpay", payments: ["created"], placedAt: old });
    const stockBefore = await stock();
    const lock = await holdRowLock(order.id);

    const run = () => cancelOrder(USER, order.orderNo, "race").then(() => "ok", (e: Error) => e.message);
    const expire = () => cleanupExpiredPendingOrders(2 * 24 * 60);
    const first = cancelFirst ? run() : expire();
    await waitForQueued(lock.holderPid, 1);
    const second = cancelFirst ? expire() : run();
    await waitForQueued(lock.holderPid, 2);
    await lock.release();
    const [r1, r2] = await Promise.all([first, second]);

    if (cancelFirst) {
      assert.equal(r1, "ok");
      /* The cron sweeps every stale order in the database, so its count is not
         this order's; the single event and single restock below are. */
      assert.equal(typeof r2, "number");
    } else {
      assert.ok((r1 as number) >= 1, "the cron cancelled it");
      assert.equal(r2, "NOT_CANCELLABLE");
    }
    const s = await snapshot(order.id);
    assert.equal(s.status, "cancelled");
    assert.equal(s.events, 1, `${suffix}: one cancellation event`);
    assert.equal(s.stock, stockBefore + 2, `${suffix}: stock released once`);
  }
});
