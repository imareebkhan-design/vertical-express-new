import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  cleanupExpiredPendingOrders,
  EXPIRY_BATCH_SIZE,
  EXPIRY_CLAIM_LEASE_MS,
  type CapturedLookup,
} from "../orders";
import { redeemCoupon } from "../coupon-eligibility";
import { PaymentConfigError } from "../payments";

/**
 * ISS-078 — the payment-window expiry must not be starved by orders it has to
 * leave pending.
 *
 * It read "the first 20 stale pending orders" with no order and no memory.
 * Orders it must not cancel — Razorpay holds an authorized payment, the lookup
 * fails, the amount mismatches, the gateway is not configured — stayed first in
 * line on every run, and every order behind them (including unpaid ones that
 * should give their stock and coupon use back) was never reached.
 *
 * The fixture: 25 blocked orders (more than one batch of 20), older than 5
 * eligible (unpaid) orders, each eligible one holding stock and a coupon use.
 * Time is injected; the gateway answer per order is injected. Orders from other
 * test files that happen to be stale are answered "unknown" (a failed lookup),
 * so this file never cancels anything it did not create.
 */

const USER = randomUUID();
const TAG = randomUUID().slice(0, 8);
const STOCK = 1000;
const QTY = 2;
const AMOUNT = 20000;
let warehouseId: string;
let variantId: string;
let productId: string;
let couponId: string;

type Answer = CapturedLookup | null | Error;
const answers = new Map<string, Answer>();
const lookups = new Map<string, number>();

function findCaptured(gw: string): Promise<CapturedLookup | null> {
  lookups.set(gw, (lookups.get(gw) ?? 0) + 1);
  const a = answers.has(gw) ? answers.get(gw)! : new Error("not this test's order");
  return a instanceof Error ? Promise.reject(a) : Promise.resolve(a);
}

/** Blocked answers, rotated so every kind of "must stay pending" is present. */
function blockedAnswer(i: number): Answer {
  switch (i % 4) {
    case 0:
      return { gatewayPaymentId: `pay_${TAG}_auth_${i}`, amountPaise: AMOUNT, status: "authorized" };
    case 1:
      return new Error("RAZORPAY_LOOKUP_FAILED:503");
    case 2:
      return { gatewayPaymentId: `pay_${TAG}_mm_${i}`, amountPaise: AMOUNT - 1, status: "captured" };
    default:
      return new PaymentConfigError("RAZORPAY_KEYS_MISSING");
  }
}

async function order(kind: "blocked" | "eligible", i: number, placedAt: Date, batch: string) {
  const gw = `order_${TAG}_${batch}_${kind}_${i}`;
  const o = await db.order.create({
    data: {
      orderNo: `ZZZQ-${TAG}-${batch}-${kind}-${i}`,
      userId: USER,
      address: { label: "Site", name: "Queue Fixture", phone: "+919999999999", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "pending_payment",
      paymentMethod: "razorpay",
      subtotalPaise: AMOUNT,
      totalPaise: AMOUNT,
      warehouseId,
      placedAt,
      items: { create: [{ variantId, title: "Queue Fixture", variantName: "Default", unitPricePaise: AMOUNT / QTY, qty: QTY, lineTotalPaise: AMOUNT }] },
      payments: { create: [{ gateway: "razorpay", amountPaise: AMOUNT, status: "created", gatewayOrderId: gw }] },
    },
  });
  if (kind === "eligible") {
    const r = await db.$transaction((tx) => redeemCoupon(tx, { couponId, userId: USER, orderId: o.id, discountPaise: 0 }));
    assert.equal(r.ok, true);
  }
  answers.set(gw, kind === "blocked" ? blockedAnswer(i) : null);
  return { id: o.id, gw };
}

/** 25 blocked orders placed before 5 eligible ones, all long stale. */
async function fixture(batch: string, base: number) {
  const blocked = [];
  for (let i = 0; i < 25; i++) blocked.push(await order("blocked", i, new Date(base - (100 - i) * 60_000), batch));
  const eligible = [];
  for (let i = 0; i < 5; i++) eligible.push(await order("eligible", i, new Date(base - (50 - i) * 60_000), batch));
  return { blocked, eligible };
}

const stock = async () =>
  (await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } })).qtyOnHand;
const redeemed = async () => (await db.coupon.findUniqueOrThrow({ where: { id: couponId } })).redeemedCount;

async function state(id: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id }, include: { payments: true, statusEvents: true, couponRedemption: true } });
  return {
    status: o.status,
    payment: o.payments[0].status,
    cancelEvents: o.statusEvents.filter((e) => e.toStatus === "cancelled").length,
    redemption: o.couponRedemption !== null,
    checkedAt: o.expiryCheckedAt?.getTime() ?? null,
  };
}

/** How many stale orders a run could claim at `at` — the N in ceil(N / batch). */
async function claimableAt(at: number) {
  return db.order.count({
    where: {
      status: "pending_payment",
      placedAt: { lte: new Date(at - 15 * 60_000) },
      OR: [{ expiryCheckedAt: null }, { expiryCheckedAt: { lt: new Date(at - EXPIRY_CLAIM_LEASE_MS) } }],
    },
  });
}

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  await db.user.create({ data: { id: USER } });
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ Queue ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  const product = await db.product.create({
    data: {
      slug: `zzz-queue-${TAG}`, title: "ZZZ Queue Fixture", brandId: brand.id, categoryId: category.id, unitLabel: "per bag", status: "published",
      variants: { create: [{ sku: `ZZZ-Q-${TAG}`, name: "Default", pricePaise: AMOUNT / QTY, isDefault: true }] },
    },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: STOCK } });
  couponId = (await db.coupon.create({ data: { code: `ZZZQ-${TAG}`, type: "flat", value: 0, usageLimit: 1000, perUserLimit: 1000 } })).id;
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
  await db.user.deleteMany({ where: { id: USER } });
});

test("more than a batch of blocked orders: later unpaid orders are still expired within ceil(N / batch) runs, blocked ones are not", async () => {
  lookups.clear();
  const T = Date.now();
  const { blocked, eligible } = await fixture("A", T);
  const [stock0, redeemed0] = [await stock(), await redeemed()];

  const N = await claimableAt(T);
  const bound = Math.ceil(N / EXPIRY_BATCH_SIZE);
  assert.ok(blocked.length > EXPIRY_BATCH_SIZE, "the blocked orders alone fill more than one batch");

  let runs = 0;
  while (runs < bound) {
    await cleanupExpiredPendingOrders(15, { findCaptured, now: () => T });
    runs++;
  }

  for (const e of eligible) {
    const s = await state(e.id);
    assert.equal(s.status, "cancelled", `eligible order expired within ${bound} runs (N = ${N})`);
    assert.equal(s.cancelEvents, 1);
    assert.equal(s.redemption, false, "coupon use given back");
  }
  assert.equal(await stock(), stock0 + eligible.length * QTY, "stock released once per eligible order");
  assert.equal(await redeemed(), redeemed0 - eligible.length, "coupon counter released once per eligible order");

  for (const b of blocked) {
    const s = await state(b.id);
    assert.equal(s.status, "pending_payment", "never cancelled on authorized / unknown / mismatch / unconfigured");
    assert.notEqual(s.payment, "captured", "an authorization or mismatch is never recorded as a capture");
    assert.equal(lookups.get(b.gw), 1, "examined once in these runs — the lease stops a repeat");
  }
});

test("blocked orders are revisited once their lease lapses, least recently examined first; an unblocked one then expires", async () => {
  lookups.clear();
  const T0 = Date.now();
  const { blocked } = await fixture("B", T0);
  const firstPass = Math.ceil((await claimableAt(T0)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < firstPass; i++) await cleanupExpiredPendingOrders(15, { findCaptured, now: () => T0 });
  for (const b of blocked) assert.equal(lookups.get(b.gw), 1, "every blocked order examined in the first pass");

  const T1 = T0 + EXPIRY_CLAIM_LEASE_MS + 1_000;
  const secondPass = Math.ceil((await claimableAt(T1)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < secondPass; i++) await cleanupExpiredPendingOrders(15, { findCaptured, now: () => T1 });
  for (const b of blocked) assert.equal(lookups.get(b.gw), 2, "every blocked order re-examined after the lease");

  /* The bank releases one authorization: Razorpay now reports nothing captured. */
  const released = blocked[0];
  answers.set(released.gw, null);
  const T2 = T1 + EXPIRY_CLAIM_LEASE_MS + 1_000;
  const bound = Math.ceil((await claimableAt(T2)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < bound; i++) await cleanupExpiredPendingOrders(15, { findCaptured, now: () => T2 });
  const s = await state(released.id);
  assert.equal(s.status, "cancelled", "the unblocked order expires on a recheck");
  assert.equal(s.cancelEvents, 1);
});

test("two workers at once: nothing released twice, no order asked about twice, and nothing lost", async () => {
  lookups.clear();
  const T = Date.now();
  const { blocked, eligible } = await fixture("C", T);
  const [stock0, redeemed0] = [await stock(), await redeemed()];

  const [a, b] = await Promise.all([
    cleanupExpiredPendingOrders(15, { findCaptured, now: () => T }),
    cleanupExpiredPendingOrders(15, { findCaptured, now: () => T }),
  ]);
  for (const o of [...blocked, ...eligible]) {
    assert.ok((lookups.get(o.gw) ?? 0) <= 1, "a claimed order is not looked up again by the other worker");
  }
  /* Whatever the overlap left, later runs finish it. */
  const more = Math.ceil((await claimableAt(T)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < more; i++) await cleanupExpiredPendingOrders(15, { findCaptured, now: () => T });

  for (const e of eligible) {
    const s = await state(e.id);
    assert.equal(s.status, "cancelled");
    assert.equal(s.cancelEvents, 1, "one cancellation event");
  }
  assert.equal(await stock(), stock0 + eligible.length * QTY, "stock released exactly once per order");
  assert.equal(await redeemed(), redeemed0 - eligible.length, "coupon use released exactly once per order");
  assert.ok(a + b <= eligible.length + 25, "counts are this run's cancellations, not double counts");
});

test("a worker that dies after claiming loses nothing: the order waits out the lease, then expires", async () => {
  lookups.clear();
  const T = Date.now();
  const { eligible } = await fixture("D", T);
  const victim = eligible[0];
  /* The claim a crashed run leaves behind. */
  await db.order.update({ where: { id: victim.id }, data: { expiryCheckedAt: new Date(T) } });

  const within = Math.ceil((await claimableAt(T + 30_000)) / EXPIRY_BATCH_SIZE) + 1;
  for (let i = 0; i < within; i++) await cleanupExpiredPendingOrders(15, { findCaptured, now: () => T + 30_000 });
  assert.equal((await state(victim.id)).status, "pending_payment", "not touched while another worker's claim holds");
  assert.equal(lookups.get(victim.gw) ?? 0, 0);

  const later = T + EXPIRY_CLAIM_LEASE_MS + 1_000;
  const bound = Math.ceil((await claimableAt(later)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < bound; i++) await cleanupExpiredPendingOrders(15, { findCaptured, now: () => later });
  const s = await state(victim.id);
  assert.equal(s.status, "cancelled", "reclaimed and expired after the lease");
  assert.equal(s.cancelEvents, 1);
});

test("the run budget stops new claims; unclaimed orders are not stranded behind a lease", async () => {
  lookups.clear();
  const T = Date.now();
  const { blocked } = await fixture("E", T);
  /* A clock that advances a minute every time the run looks at it; budget 2 minutes. */
  let tick = T;
  await cleanupExpiredPendingOrders(15, { findCaptured, now: () => (tick += 60_000) - 60_000, runBudgetMs: 2 * 60_000 });
  const examined = [...lookups.values()].reduce((s, n) => s + n, 0);
  assert.ok(examined <= 2, `stopped claiming after the budget (examined ${examined})`);
  const untouched = (await Promise.all(blocked.map((b) => state(b.id)))).filter((s) => s.checkedAt === null).length;
  assert.ok(untouched >= blocked.length - 2, "orders the run did not reach carry no claim");
});

/* ── What bounds progress when runs are not full batches ──────────────────────
   ceil(N / batch) runs holds only for runs that each examine a full batch. A run
   cut short by its budget (a slow gateway), sharing its batch with an
   overlapping run, or dying after a claim examines fewer. These pin what does
   hold then. The fixtures are placed 30 days back so that, among never-examined
   orders, they are first in line whatever other files left behind. */

const DAY = 24 * 60 * 60_000;
/** A run whose clock advances a minute per reading, with a one-minute budget: it examines one order. */
const oneOrderRun = (from: number) => {
  let tick = from;
  return cleanupExpiredPendingOrders(15, { findCaptured, now: () => (tick += 60_000) - 60_000, runBudgetMs: 60_000 });
};

test("runs cut short by the budget: each still examines one order, unreached orders keep their place, and ceil(N / batch) runs no longer suffice", async () => {
  lookups.clear();
  const T = Date.now();
  const { blocked, eligible } = await fixture("F", T - 30 * DAY);

  await oneOrderRun(T);
  assert.equal(lookups.get(blocked[0].gw), 1, "a run out of time still examines the first order in line");
  assert.equal([...lookups.values()].reduce((s, n) => s + n, 0), 1, "and only that one");

  /* The first claim has lapsed: blocked[0] is claimable again, but it was examined
     and blocked[1] was not, so blocked[1] is next. */
  const T2 = T + EXPIRY_CLAIM_LEASE_MS + 61_000;
  await oneOrderRun(T2);
  assert.equal(lookups.get(blocked[1].gw), 1, "the next run resumes at the first order not yet reached");
  assert.equal(lookups.get(blocked[0].gw), 1, "not at the order already examined");

  /* The run-count bound is conditional on full batches. */
  const T3 = T2 + EXPIRY_CLAIM_LEASE_MS + 61_000;
  const fullBatchBound = Math.ceil((await claimableAt(T3)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < fullBatchBound; i++) await oneOrderRun(T3);
  assert.equal((await state(eligible[0].id)).status, "pending_payment", "short runs: ceil(N / batch) runs did not reach it");

  /* What holds instead: a never-examined order is reached once the never-examined
     orders ahead of it have been examined — here one per run. */
  const last = eligible[eligible.length - 1];
  const lastPlacedAt = (await db.order.findUniqueOrThrow({ where: { id: last.id } })).placedAt;
  const ahead = await db.order.count({
    where: { status: "pending_payment", expiryCheckedAt: null, placedAt: { lt: lastPlacedAt } },
  });
  for (let i = 0; i < ahead + 1; i++) await oneOrderRun(T3);
  for (const e of eligible) assert.equal((await state(e.id)).status, "cancelled", "every unpaid order reached, one run per order ahead of it");
});

test("a claim left by a crashed worker costs the order its place: it goes behind every order examined less recently", async () => {
  lookups.clear();
  const T = Date.now();
  const { blocked } = await fixture("G", T - 60 * DAY);
  /* The oldest order of the fixture, unpaid — first in line, until a crashed run claims it. */
  const victim = blocked[0];
  answers.set(victim.gw, null);
  await db.order.update({ where: { id: victim.id }, data: { expiryCheckedAt: new Date(T) } });

  const later = T + EXPIRY_CLAIM_LEASE_MS + 1_000;
  await cleanupExpiredPendingOrders(15, { findCaptured, now: () => later });
  assert.equal(lookups.get(victim.gw) ?? 0, 0, "a full batch of never-examined orders goes first, although all were placed later");
  assert.equal((await state(victim.id)).status, "pending_payment");

  const bound = Math.ceil((await claimableAt(later)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < bound; i++) await cleanupExpiredPendingOrders(15, { findCaptured, now: () => later });
  assert.equal((await state(victim.id)).status, "cancelled", "reached once the orders ahead of it were examined");
});

/* Added 30 Sep 2026 (ISS-078 audit). Each run below gets its own gateway stub —
   its own lookup counter, nothing shared between runs except the database and
   the gateway's answers — as a restarted process would. */
function freshRun() {
  const seen = new Map<string, number>();
  const find = (gw: string): Promise<CapturedLookup | null> => {
    seen.set(gw, (seen.get(gw) ?? 0) + 1);
    return findCaptured(gw);
  };
  return { find, seen, total: () => [...seen.values()].reduce((s, n) => s + n, 0) };
}

test("behind more than a batch of blocked orders: a correct capture is settled (stock and coupon kept), an unpaid order expires, and no run asks the gateway more than a batch's worth", async () => {
  lookups.clear();
  const T = Date.now();
  const { blocked } = await fixture("H", T - 90 * DAY);
  const [paid, unpaid] = [
    await order("eligible", 100, new Date(T - 90 * DAY + 60_000), "H"),
    await order("eligible", 101, new Date(T - 90 * DAY + 120_000), "H"),
  ];
  answers.set(paid.gw, { gatewayPaymentId: `pay_${TAG}_ok`, amountPaise: AMOUNT, status: "captured" });
  /* This file's orders share one product and coupon, and an earlier test leaves
     unpaid orders unreached on purpose: these runs may expire them too. Every
     order this file creates that ends cancelled must have released exactly once. */
  const cancelledOfFile = () => db.order.count({ where: { orderNo: { startsWith: `ZZZQ-${TAG}` }, status: "cancelled" } });
  const [stock0, redeemed0, cancelled0] = [await stock(), await redeemed(), await cancelledOfFile()];

  const bound = Math.ceil((await claimableAt(T)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < bound; i++) {
    const run = freshRun();
    await cleanupExpiredPendingOrders(15, { findCaptured: run.find, now: () => T });
    assert.ok(run.total() <= EXPIRY_BATCH_SIZE, `run ${i + 1}: ${run.total()} gateway lookups — at most one batch`);
    for (const [gw, n] of run.seen) assert.equal(n, 1, `run ${i + 1}: ${gw} asked about once`);
  }

  const p = await state(paid.id);
  assert.equal(p.status, "confirmed", "a correct capture found by the expiry confirms the order");
  assert.equal(p.payment, "captured");
  assert.equal(p.cancelEvents, 0);
  assert.equal(p.redemption, true, "its coupon use is kept");
  const u = await state(unpaid.id);
  assert.equal(u.status, "cancelled", `the unpaid order behind ${blocked.length} blocked ones expired within ${bound} runs`);
  assert.equal(u.cancelEvents, 1);
  const newlyCancelled = (await cancelledOfFile()) - cancelled0;
  assert.ok(newlyCancelled >= 1);
  assert.equal(await stock(), stock0 + newlyCancelled * QTY, "stock released once per cancelled order — none for the settled one");
  assert.equal(await redeemed(), redeemed0 - newlyCancelled, "coupon use released once per cancelled order — kept by the settled one");
  for (const b of blocked) assert.equal((await state(b.id)).status, "pending_payment");
});

test("restart between runs: each run starts from the database alone — the next run resumes where the last stopped, and blocked orders are revisited after the lease", async () => {
  lookups.clear();
  const T = Date.now();
  const { blocked, eligible } = await fixture("I", T - 120 * DAY);

  const first = freshRun();
  await cleanupExpiredPendingOrders(15, { findCaptured: first.find, now: () => T });
  assert.equal(first.total(), EXPIRY_BATCH_SIZE, "a full first batch");
  for (let i = 0; i < EXPIRY_BATCH_SIZE; i++) assert.equal(first.seen.get(blocked[i].gw), 1, "the oldest 20 first");

  /* "Restart": a new stub, no memory of the first run. */
  const second = freshRun();
  await cleanupExpiredPendingOrders(15, { findCaptured: second.find, now: () => T + 1_000 });
  for (const gw of first.seen.keys()) assert.equal(second.seen.get(gw) ?? 0, 0, "nothing the first run examined is asked about again within the lease");
  for (let i = EXPIRY_BATCH_SIZE; i < blocked.length; i++) assert.equal(second.seen.get(blocked[i].gw), 1, "it resumes at the first order not yet examined");
  for (const e of eligible) assert.equal((await state(e.id)).status, "cancelled", "and reaches the unpaid orders behind them");

  /* After the lease, fresh runs revisit the blocked orders — each looked up again,
     once — within ceil(N / batch) full runs (earlier tests' orders may be ahead). */
  const later = T + EXPIRY_CLAIM_LEASE_MS + 2_000;
  const revisits = new Map<string, number>();
  const bound = Math.ceil((await claimableAt(later)) / EXPIRY_BATCH_SIZE);
  for (let i = 0; i < bound; i++) {
    const run = freshRun();
    await cleanupExpiredPendingOrders(15, { findCaptured: run.find, now: () => later });
    for (const [gw, n] of run.seen) revisits.set(gw, (revisits.get(gw) ?? 0) + n);
  }
  for (const b of blocked) assert.equal(revisits.get(b.gw), 1, `blocked order looked up again, once, within ${bound} runs`);
  for (const b of blocked) assert.equal((await state(b.id)).status, "pending_payment", "and still not cancelled");
});
