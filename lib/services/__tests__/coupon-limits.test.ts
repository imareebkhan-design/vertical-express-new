import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveCoupon } from "@/lib/services/coupon-eligibility";
import { db } from "@/lib/db";

/**
 * Coupon limits, which were on the model and on the console screen and
 * enforced nowhere.
 *
 * `usageLimit`, `perUserLimit` and `firstNOrders` all existed as columns and
 * were all printed in operations. Checkout checked `isActive`, the date window
 * and `minOrderPaise` and nothing else — so "one per customer, 100 uses" was in
 * fact unlimited, per person and overall, while the screen said otherwise.
 * Anybody who learned a code could spend it as often as they liked.
 *
 * That is money leaving the business, so these are written the way the other
 * money tests here are: the limit is set, orders are placed against it, and the
 * boundary is checked from both sides — the last allowed use and the first
 * refused one.
 */
const P = "ZZZTEST";

async function cleanup() {
  const orders = await db.order.findMany({
    where: { orderNo: { startsWith: P } },
    select: { id: true },
  });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.user.deleteMany({ where: { email: { startsWith: P.toLowerCase() } } });
  await db.coupon.deleteMany({ where: { code: { startsWith: P } } });
}

async function makeUser() {
  return db.user.create({
    data: { id: randomUUID(), email: `${P.toLowerCase()}-${randomUUID().slice(0, 8)}@example.invalid` },
  });
}

async function makeCoupon(fields: Partial<Parameters<typeof db.coupon.create>[0]["data"]> = {}) {
  return db.coupon.create({
    data: {
      code: `${P}-${randomUUID().slice(0, 8)}`.toUpperCase(),
      type: "flat",
      value: 10_000,
      isActive: true,
      perUserLimit: 1,
      ...fields,
    } as Parameters<typeof db.coupon.create>[0]["data"],
  });
}

/** An order that consumed a coupon. `status` decides whether it counts. */
async function orderWith(code: string | null, userId: string, status: "delivered" | "cancelled") {
  return db.order.create({
    data: {
      orderNo: `${P}-${randomUUID().slice(0, 8)}`,
      userId,
      address: {},
      status,
      paymentMethod: "dummy",
      subtotalPaise: 100_000,
      totalPaise: 100_000,
      couponCode: code,
    },
  });
}

const SUBTOTAL = 100_000;

test("a coupon within its limits is allowed", async (t) => {
  t.after(cleanup);
  await cleanup();
  const user = await makeUser();
  const c = await makeCoupon({ usageLimit: 2, perUserLimit: 1 });

  const d = await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: user.id });
  assert.equal(d.ok, true);
});

test("the overall usage limit is enforced at the boundary", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ usageLimit: 2, perUserLimit: 99 });
  const a = await makeUser();
  const b = await makeUser();

  await orderWith(c.code, a.id, "delivered");
  /* One use left — the last allowed one. */
  assert.equal((await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: b.id })).ok, true);

  await orderWith(c.code, b.id, "delivered");
  const after = await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: b.id });
  assert.equal(after.ok, false, "a coupon was usable past its usage limit");
  assert.equal(after.ok === false && after.reason, "usage_limit_reached");
});

test("the per-customer limit is enforced, and is per customer", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ perUserLimit: 1, usageLimit: null });
  const a = await makeUser();
  const b = await makeUser();

  await orderWith(c.code, a.id, "delivered");

  const again = await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: a.id });
  assert.equal(again.ok, false, "one customer used a one-per-customer coupon twice");
  assert.equal(again.ok === false && again.reason, "per_user_limit_reached");

  /* Somebody else is unaffected — the limit is per person, not global. */
  assert.equal((await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: b.id })).ok, true);
});

test("a cancelled order gives its use back", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ perUserLimit: 1 });
  const a = await makeUser();

  await orderWith(c.code, a.id, "cancelled");

  /* The order never completed, so it did not spend the coupon. Counting it
     would leave a customer unable to reuse a code after a failed checkout. */
  assert.equal(
    (await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: a.id })).ok,
    true,
    "a cancelled order consumed the coupon"
  );
});

test("first-N-orders counts the customer's orders, not the coupon's", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ firstNOrders: 2, perUserLimit: 99 });
  const a = await makeUser();

  /* No prior orders — this would be their first. */
  assert.equal((await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: a.id })).ok, true);

  await orderWith(null, a.id, "delivered");
  /* One prior order — this would be their second, still within the first two. */
  assert.equal((await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: a.id })).ok, true);

  await orderWith(null, a.id, "delivered");
  const third = await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: a.id });
  assert.equal(third.ok, false, "a new-customer coupon worked on a third order");
  assert.equal(third.ok === false && third.reason, "not_within_first_orders");
});

test("the minimum order value still holds", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ minOrderPaise: 50_000 });
  const a = await makeUser();

  const below = await resolveCoupon({ code: c.code, subtotalPaise: 49_999, userId: a.id });
  assert.equal(below.ok, false);
  assert.equal(below.ok === false && below.reason, "below_minimum");

  assert.equal((await resolveCoupon({ code: c.code, subtotalPaise: 50_000, userId: a.id })).ok, true);
});

test("an inactive or expired coupon is refused", async (t) => {
  t.after(cleanup);
  await cleanup();
  const a = await makeUser();

  const off = await makeCoupon({ isActive: false });
  assert.equal((await resolveCoupon({ code: off.code, subtotalPaise: SUBTOTAL, userId: a.id })).ok, false);

  const expired = await makeCoupon({ endsAt: new Date(Date.now() - 86_400_000) });
  assert.equal((await resolveCoupon({ code: expired.code, subtotalPaise: SUBTOTAL, userId: a.id })).ok, false);

  const future = await makeCoupon({ startsAt: new Date(Date.now() + 86_400_000) });
  assert.equal((await resolveCoupon({ code: future.code, subtotalPaise: SUBTOTAL, userId: a.id })).ok, false);
});

test("a signed-out preview defers the per-customer rules rather than guessing", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ perUserLimit: 1 });
  const a = await makeUser();
  await orderWith(c.code, a.id, "delivered");

  /* Without an identity there is no way to know whose limit to check. The
     coupon reads as valid in preview and is decided at placement, which always
     has a user. Refusing here would tell every signed-out visitor that a
     perfectly good code is invalid. */
  const anon = await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: null });
  assert.equal(anon.ok, true);
});

test("the overall limit is still checked without an identity", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ usageLimit: 1, perUserLimit: 99 });
  const a = await makeUser();
  await orderWith(c.code, a.id, "delivered");

  /* Unlike the per-customer rules, this one needs no identity — so a
     signed-out visitor is told the truth rather than being offered a coupon
     that will fail the moment they sign in. */
  const anon = await resolveCoupon({ code: c.code, subtotalPaise: SUBTOTAL, userId: null });
  assert.equal(anon.ok, false);
  assert.equal(anon.ok === false && anon.reason, "usage_limit_reached");
});
