/**
 * Admin order status changes — found by the closure-loop security review.
 *
 * `advanceOrderStatus` read the status outside its transaction and wrote it
 * unconditionally. A payment settling in between was overwritten (a paid order
 * cancelled, its stock released, no alert); two cancels released stock twice;
 * and an unpaid online order could be confirmed by hand. It is now a
 * compare-and-set, an online order is confirmed only by its payment, and a
 * paid order may still be cancelled but is flagged refund-required.
 *
 * Interleavings are forced with a held row lock and pg_stat_activity, as in
 * order-cancel-paid.test.ts, not timed.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { advanceOrderStatus } from "../admin/manage";
import { settleCapturedPayment, listCapturedPaymentsOnDeadOrders } from "../checkout";

const USER = randomUUID();
const ADMIN = randomUUID();
const TAG = `ADM${Date.now() % 1_000_000}`;
let warehouseId: string;
let variantId: string;
let productId: string;

const ADDRESS = { label: "site", name: "Admin Status Test", phone: "9876543210", line1: "Plot 1", line2: null, landmark: null, city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" };

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
        create: { variantId, title: "Admin Status Item", variantName: "Unit", unitPricePaise: 5000, qty: 2, lineTotalPaise: 10000 },
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
  const wh = await db.warehouse.create({ data: { name: `Admin Status WH ${TAG}`, city: "Srinagar", pincode: "190001" } });
  warehouseId = wh.id;
  const product = await db.product.create({
    data: { title: "Admin Status Item", slug: `admin-status-${TAG.toLowerCase()}`, categoryId: category.id, brandId: brand.id },
  });
  productId = product.id;
  const variant = await db.productVariant.create({ data: { productId, name: "Unit", sku: `SKU-${TAG}`, pricePaise: 5000 } });
  variantId = variant.id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 100 } });
});

after(async () => {
  await db.auditLog.deleteMany({ where: { actorId: ADMIN } });
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

test("an unpaid online order cannot be confirmed by hand, and nothing changes", async () => {
  const order = await makeOrder({ suffix: "UNPAID", status: "pending_payment", paymentMethod: "razorpay", payments: ["created"] });
  const before = await snapshot(order.id);
  await assert.rejects(advanceOrderStatus(ADMIN, order.id, "confirmed"), /PAYMENT_REQUIRED/);
  assert.deepEqual(await snapshot(order.id), before);
});

test("cash on delivery, and an online order with a captured payment, can be confirmed", async () => {
  const cod = await makeOrder({ suffix: "COD", status: "pending_payment", paymentMethod: "cod" });
  await advanceOrderStatus(ADMIN, cod.id, "confirmed");
  assert.equal((await snapshot(cod.id)).status, "confirmed");
  const paid = await makeOrder({ suffix: "PAID", status: "pending_payment", paymentMethod: "razorpay", payments: ["captured"] });
  await advanceOrderStatus(ADMIN, paid.id, "confirmed");
  assert.equal((await snapshot(paid.id)).status, "confirmed");
});

test("cancelling a paid order is allowed, flagged refund-required, restocks once, and reaches the refund worklist", async () => {
  const order = await makeOrder({ suffix: "PAIDCXL", status: "confirmed", paymentMethod: "razorpay", payments: ["captured"] });
  const stockBefore = await stock();
  await advanceOrderStatus(ADMIN, order.id, "cancelled");
  const s = await snapshot(order.id);
  assert.equal(s.status, "cancelled");
  assert.equal(s.stock, stockBefore + 2);
  const notes = (await events(order.id)).map((e) => e.note ?? "");
  assert.match(notes[notes.length - 1], /refund required/i);
  assert.ok((await listCapturedPaymentsOnDeadOrders()).some((p) => p.order.orderNo === order.orderNo));
});

test("a payment settling first beats an admin cancel in flight: the cancel changes nothing", async () => {
  const order = await makeOrder({ suffix: "RACE-SETTLE", status: "pending_payment", paymentMethod: "cod", payments: ["created"] });
  const stockBefore = await stock();
  const lock = await holdRowLock(order.id);
  const settling = settle(order);
  await waitForQueued(lock.holderPid, 1);
  const cancelling = advanceOrderStatus(ADMIN, order.id, "cancelled").then(() => "ok", (e: Error) => e.message);
  await waitForQueued(lock.holderPid, 2);
  await lock.release();
  assert.equal(await settling, "confirmed");
  assert.equal(await cancelling, "STATUS_CHANGED");
  const s = await snapshot(order.id);
  assert.equal(s.status, "confirmed");
  assert.equal(s.stock, stockBefore, "no stock released");
});

test("two admin cancels at once: one wins, stock released once", async () => {
  const order = await makeOrder({ suffix: "RACE-DUP", status: "confirmed", paymentMethod: "cod" });
  const stockBefore = await stock();
  const lock = await holdRowLock(order.id);
  const a = advanceOrderStatus(ADMIN, order.id, "cancelled").then(() => "ok", (e: Error) => e.message);
  await waitForQueued(lock.holderPid, 1);
  const b = advanceOrderStatus(ADMIN, order.id, "cancelled").then(() => "ok", (e: Error) => e.message);
  await waitForQueued(lock.holderPid, 2);
  await lock.release();
  assert.deepEqual([await a, await b].sort(), ["STATUS_CHANGED", "ok"]);
  const s = await snapshot(order.id);
  assert.equal(s.stock, stockBefore + 2, "stock released exactly once");
  assert.equal((await events(order.id)).filter((e) => e.toStatus === "cancelled").length, 1);
});
