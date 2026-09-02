import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { redeemCoupon } from "@/lib/services/coupon-eligibility";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@/lib/db";

/**
 * Spending a coupon, atomically.
 *
 * `resolveCoupon` decides a coupon MAY be used; that check and the order which
 * follows are separate statements, so two orders in the same instant both pass
 * it. This is the residual race ISS-066 left open, and these tests are about
 * the mechanisms that close it.
 *
 * Two limits, two mechanisms, tested separately because they fail differently:
 * `usageLimit` is a count across everyone and is guarded by a conditional
 * increment; `perUserLimit` is per customer and is guarded by a unique
 * constraint on (couponId, userId, useIndex).
 */
const P = "ZZZREDEEM";

async function cleanup() {
  const orders = await db.order.findMany({
    where: { orderNo: { startsWith: P } },
    select: { id: true },
  });
  await db.couponRedemption.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.coupon.deleteMany({ where: { code: { startsWith: P } } });
  await db.user.deleteMany({ where: { email: { startsWith: P.toLowerCase() } } });
}

async function makeUser() {
  return db.user.create({
    data: { id: randomUUID(), email: `${P.toLowerCase()}-${randomUUID().slice(0, 8)}@example.invalid` },
  });
}

async function makeCoupon(fields: { usageLimit?: number | null; perUserLimit?: number }) {
  return db.coupon.create({
    data: {
      code: `${P}-${randomUUID().slice(0, 8)}`.toUpperCase(),
      type: "flat",
      value: 10_000,
      usageLimit: fields.usageLimit ?? null,
      perUserLimit: fields.perUserLimit ?? 1,
    },
  });
}

async function makeOrder(userId: string) {
  return db.order.create({
    data: {
      orderNo: `${P}-${randomUUID().slice(0, 8)}`,
      userId,
      address: {},
      status: "confirmed",
      paymentMethod: "dummy",
      subtotalPaise: 100_000,
      totalPaise: 100_000,
    },
  });
}

/** Redeem in its own transaction, the way the order path does. */
function redeem(couponId: string, userId: string, orderId: string) {
  return db.$transaction((tx) =>
    redeemCoupon(tx, { couponId, userId, orderId, discountPaise: 10_000 })
  );
}

test("a redemption is recorded and the counter moves", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ usageLimit: 5, perUserLimit: 2 });
  const u = await makeUser();
  const o = await makeOrder(u.id);

  const r = await redeem(c.id, u.id, o.id);
  assert.equal(r.ok, true);

  const after = await db.coupon.findUnique({ where: { id: c.id }, select: { redeemedCount: true } });
  assert.equal(after?.redeemedCount, 1, "the counter did not move");

  const rows = await db.couponRedemption.findMany({ where: { couponId: c.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].useIndex, 1);
  assert.equal(rows[0].discountPaise, 10_000);
});

test("RACE: a claim computed against a stale count is refused", async (t) => {
  t.after(cleanup);
  await cleanup();
  /* THE RACE, STAGED.
   *
   * My first version of this ran two redeemCoupon calls through Promise.all
   * and asserted one winner. It passed with the conditional increment REPLACED
   * by count-then-decide — the two transactions did not actually interleave,
   * so it proved nothing about the thing it was named after. That is the same
   * mistake I made on the stock adjuster, and a green tick over the exact bug
   * it claims to cover is worse than no test.
   *
   * So the stale read is staged rather than hoped for. Somebody else takes the
   * last use between our read and our write; the conditional increment must
   * then match zero rows instead of pushing the counter past the limit. */
  const c = await makeCoupon({ usageLimit: 1, perUserLimit: 9 });

  // We read: nothing claimed yet, so there is room.
  const seen = 0;

  // Somebody else redeems and commits first.
  await db.coupon.update({ where: { id: c.id }, data: { redeemedCount: 1 } });

  // Our write, still carrying the precondition we read.
  const claimed = await db.coupon.updateMany({
    where: { id: c.id, redeemedCount: { lt: 1 } },
    data: { redeemedCount: { increment: 1 } },
  });

  assert.equal(seen, 0);
  assert.equal(claimed.count, 0, "a stale claim was applied over somebody else's redemption");

  const after = await db.coupon.findUnique({ where: { id: c.id }, select: { redeemedCount: true } });
  assert.equal(after?.redeemedCount, 1, "the counter overshot the usage limit");
});

test("RACE: the per-customer limit is held by the database, not by a check", async (t) => {
  t.after(cleanup);
  await cleanup();
  /* The other mechanism, also staged. Two orders both computing useIndex 2 is
     what a real race produces; the unique constraint on
     (couponId, userId, useIndex) is what refuses the second, regardless of how
     the application counted. */
  const c = await makeCoupon({ usageLimit: null, perUserLimit: 5 });
  const u = await makeUser();
  const o1 = await makeOrder(u.id);
  const o2 = await makeOrder(u.id);

  await db.couponRedemption.create({
    data: { couponId: c.id, userId: u.id, orderId: o1.id, useIndex: 2, discountPaise: 1 },
  });

  await assert.rejects(
    () =>
      db.couponRedemption.create({
        data: { couponId: c.id, userId: u.id, orderId: o2.id, useIndex: 2, discountPaise: 1 },
      }),
    "two redemptions took the same use index for one customer"
  );
});

test("redeemCoupon uses the guards, not a count-then-decide", () => {
  /* The two tests above prove the mechanisms work. This proves redeemCoupon
     actually uses them — otherwise the proofs are of something nothing calls,
     which is how the first version of this file passed while the race was
     wide open. */
  const src = readFileSync(
    join(fileURLToPath(new URL("../../../", import.meta.url)), "lib/services/coupon-eligibility.ts"),
    "utf8"
  ).replace(/\/\*[\s\S]*?\*\//g, " ");

  assert.match(
    src,
    /updateMany\(\{[\s\S]{0,160}redeemedCount:\s*\{\s*lt:/,
    "the usage limit is no longer taken with a conditional increment"
  );
  assert.match(src, /claimed\.count !== 1/, "the conditional increment's result is not checked");
  assert.match(
    src,
    /couponRedemption\.create/,
    "no redemption row is written, so the unique constraints guard nothing"
  );
});

test("the same order cannot redeem twice", async (t) => {
  t.after(cleanup);
  await cleanup();
  /* A retried placement must not spend the coupon again. The unique constraint
     on orderId is what makes redemption idempotent per order. */
  const c = await makeCoupon({ usageLimit: 9, perUserLimit: 9 });
  const u = await makeUser();
  const o = await makeOrder(u.id);

  assert.equal((await redeem(c.id, u.id, o.id)).ok, true);
  const second = await redeem(c.id, u.id, o.id).catch(() => ({ ok: false as const }));
  assert.equal(second.ok, false, "one order redeemed the same coupon twice");
  assert.equal(await db.couponRedemption.count({ where: { orderId: o.id } }), 1);
});

test("an exhausted coupon is refused with a reason", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ usageLimit: 1, perUserLimit: 9 });
  const a = await makeUser();
  const b = await makeUser();

  await redeem(c.id, a.id, (await makeOrder(a.id)).id);
  const r = await redeem(c.id, b.id, (await makeOrder(b.id)).id);

  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "exhausted");
});

test("a customer's second allowed use gets index 2", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ usageLimit: null, perUserLimit: 2 });
  const u = await makeUser();

  await redeem(c.id, u.id, (await makeOrder(u.id)).id);
  const second = await redeem(c.id, u.id, (await makeOrder(u.id)).id);
  assert.equal(second.ok, true, "a second allowed use was refused");

  const rows = await db.couponRedemption.findMany({
    where: { couponId: c.id, userId: u.id },
    orderBy: { useIndex: "asc" },
  });
  assert.deepEqual(rows.map((r) => r.useIndex), [1, 2]);

  /* And the third is refused. */
  const third = await redeem(c.id, u.id, (await makeOrder(u.id)).id);
  assert.equal(third.ok, false);
});

test("an unlimited coupon still counts, for reporting", async (t) => {
  t.after(cleanup);
  await cleanup();
  const c = await makeCoupon({ usageLimit: null, perUserLimit: 9 });
  const u = await makeUser();

  await redeem(c.id, u.id, (await makeOrder(u.id)).id);
  await redeem(c.id, u.id, (await makeOrder(u.id)).id);

  const after = await db.coupon.findUnique({ where: { id: c.id }, select: { redeemedCount: true } });
  assert.equal(after?.redeemedCount, 2, "an unlimited coupon stopped counting its uses");
});
