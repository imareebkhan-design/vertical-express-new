import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { redeemCoupon } from "../coupon-eligibility";
import { cancelOrder, cleanupExpiredPendingOrders } from "../orders";
import { advanceOrderStatus } from "../admin/manage";

/**
 * A cancelled order gives its coupon use back (closure-loop review, P2).
 * `resolveCoupon` never counted cancelled orders, but placement counted the
 * redemption row and `redeemedCount`, and no cancel path released either: the
 * preview said "valid" and checkout refused it, and abandoned orders used up a
 * coupon's limit. Every cancel path now releases both.
 */

const USER = randomUUID();
const ADMIN = randomUUID();
const TAG = `CPR${Date.now() % 1_000_000}`;
const ADDRESS = { label: "site", name: "Coupon Release", phone: "9876543210", line1: "Plot 1", line2: null, landmark: null, city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" };
let couponId: string;

async function orderWithCoupon(suffix: string, opts: { status?: "pending_payment" | "confirmed"; placedAt?: Date; paymentMethod?: "razorpay" | "cod" } = {}) {
  const o = await db.order.create({
    data: {
      orderNo: `${TAG}-${suffix}`, userId: USER, address: ADDRESS, status: opts.status ?? "pending_payment",
      paymentMethod: opts.paymentMethod ?? "razorpay", subtotalPaise: 10000, totalPaise: 10000, couponCode: `${TAG}-CODE`,
      ...(opts.placedAt ? { placedAt: opts.placedAt } : {}),
    },
  });
  const r = await db.$transaction((tx) => redeemCoupon(tx, { couponId, userId: USER, orderId: o.id, discountPaise: 500 }));
  assert.equal(r.ok, true, `redeem for ${suffix}`);
  return o;
}
const coupon = () => db.coupon.findUniqueOrThrow({ where: { id: couponId } });
const redemptions = () => db.couponRedemption.findMany({ where: { couponId }, orderBy: { useIndex: "asc" } });

before(async () => {
  await db.user.createMany({ data: [
    { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
    { id: ADMIN, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
  ] });
  const c = await db.coupon.create({ data: { code: `${TAG}-CODE`, type: "flat", value: 500, usageLimit: 10, perUserLimit: 3 } });
  couponId = c.id;
});

after(async () => {
  await db.auditLog.deleteMany({ where: { actorId: ADMIN } });
  await db.couponRedemption.deleteMany({ where: { couponId } });
  await db.orderStatusEvent.deleteMany({ where: { order: { userId: USER } } });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.coupon.deleteMany({ where: { id: couponId } });
  await db.user.deleteMany({ where: { id: { in: [USER, ADMIN] } } });
});

test("a customer cancel gives the coupon use back — row and counter", async () => {
  const o = await orderWithCoupon("CUST");
  assert.equal((await coupon()).redeemedCount, 1);
  await cancelOrder(USER, o.orderNo, "changed my mind");
  assert.equal((await coupon()).redeemedCount, 0);
  assert.equal(await db.couponRedemption.count({ where: { orderId: o.id } }), 0);
});

test("the expiry cron gives it back too", async () => {
  const o = await orderWithCoupon("CRON", { placedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) });
  const before = (await coupon()).redeemedCount;
  await cleanupExpiredPendingOrders(2 * 24 * 60);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "cancelled");
  assert.equal((await coupon()).redeemedCount, before - 1);
  assert.equal(await db.couponRedemption.count({ where: { orderId: o.id } }), 0);
});

test("an admin cancel gives it back too", async () => {
  const o = await orderWithCoupon("ADMIN", { status: "confirmed", paymentMethod: "cod" });
  const before = (await coupon()).redeemedCount;
  await advanceOrderStatus(ADMIN, o.id, "cancelled");
  assert.equal((await coupon()).redeemedCount, before - 1);
  assert.equal(await db.couponRedemption.count({ where: { orderId: o.id } }), 0);
});

test("a released use leaves a gap the next redemption does not collide with", async () => {
  const a = await orderWithCoupon("GAP-A");
  await orderWithCoupon("GAP-B");
  await cancelOrder(USER, a.orderNo, "gap");
  /* count + 1 would be 2, which GAP-B holds; the index is one past the highest. */
  await orderWithCoupon("GAP-C");
  const idx = (await redemptions()).map((r) => r.useIndex);
  assert.equal(new Set(idx).size, idx.length, `indices unique: ${idx.join(",")}`);
});
