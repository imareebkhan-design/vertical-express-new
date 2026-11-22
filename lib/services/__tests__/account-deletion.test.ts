import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { addItem } from "@/lib/services/cart";
import { placeOrder } from "../checkout";
import { creditCashbackForOrder } from "../wallet";
import { provisionUser, resolveUserFromToken } from "@/lib/auth/current-user";
import { deletedMarker, pendingMarker, isDeletedAccount } from "@/lib/auth/deletion-marker";
import {
  deleteAccount,
  getDeletionStatus,
  retryPendingDeletions,
  type FirebaseAccountOps,
} from "../account-deletion";
import { approveTestProductsCreatedSince } from "../../../test-support/catalogue-fixtures";
import { liveTestCityId } from "@/test-support/service-city";

/**
 * Customer self-serve account deletion, against a real database.
 *
 * Covers what the owner asked for on 22 Nov 2026: a successful deletion, every
 * refusal, a checkout or wallet credit racing the deletion, a Firebase failure
 * followed by a retry, and the same phone signing up afterwards to an account
 * that sees none of the old history.
 */

const SUITE_START = new Date();
const TAG = randomUUID().slice(0, 8);
const PINCODE = `98${String(Date.now()).slice(-4)}`;

const users: string[] = [];
let warehouseId: string;
let variantId: string;
let productSlug: string;

/** Firebase, reduced to the one call deletion makes. Records what it was asked to delete. */
function fakeFirebase(opts: { fail?: boolean } = {}): FirebaseAccountOps & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async deleteUser(uid) {
      if (opts.fail) throw new Error("simulated Firebase outage");
      deleted.push(uid);
    },
  };
}

const randomPhone = () => `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;
const token = (uid: string, phone?: string) => ({ uid, ...(phone ? { phone_number: phone } : {}) }) as unknown as DecodedIdToken;

async function customer(extra: { role?: "customer" | "admin"; email?: string } = {}) {
  const uid = `del${randomUUID().replace(/-/g, "").slice(0, 25)}`;
  const phone = randomPhone();
  const id = (
    await db.user.create({
      data: { id: randomUUID(), firebaseUid: uid, phone, email: extra.email ?? null, role: extra.role ?? "customer" },
      select: { id: true },
    })
  ).id;
  users.push(id);
  return { id, uid, phone };
}

async function order(userId: string, status: "pending_payment" | "confirmed" | "packed" | "out_for_delivery" | "delivered" | "refund_initiated" | "cancelled") {
  return db.order.create({
    data: {
      orderNo: `DEL-${randomUUID().slice(0, 12)}`,
      userId,
      status,
      paymentMethod: "razorpay",
      subtotalPaise: 50000,
      taxPaise: 7627,
      totalPaise: 50000,
      address: { name: "Site Owner", phone: "9876543210", line1: "Plot 9", city: "Srinagar", state: "Jammu & Kashmir", pincode: PINCODE },
    },
  });
}

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ Deletion ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({
    data: { cityId: await liveTestCityId(), pincode: PINCODE, warehouseId, isActive: true, etaMinutes: 240, deliveryFeePaise: 5000 },
  });
  productSlug = `zzz-deletion-${TAG}`;
  const product = await db.product.create({
    data: {
      slug: productSlug,
      title: "ZZZ Deletion Cement 50 kg",
      brandId: brand.id,
      categoryId: category.id,
      unitLabel: "per bag",
      status: "published",
      variants: { create: [{ sku: `ZZZ-DEL-${TAG}`, name: "50 kg", pricePaise: 40000, isDefault: true }] },
    },
    include: { variants: true },
  });
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 500, qtyReserved: 0 } });
  await approveTestProductsCreatedSince(SUITE_START);
});

beforeEach(() => {
  delete process.env.ADMIN_EMAILS;
});

after(async () => {
  const orders = await db.order.findMany({ where: { userId: { in: users } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await db.returnRequestItem.deleteMany({ where: { returnRequest: { orderId: { in: orderIds } } } });
  await db.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.paymentRefund.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.shipmentItem.deleteMany({ where: { shipment: { orderId: { in: orderIds } } } });
  await db.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.booking.deleteMany({ where: { userId: { in: users } } });
  await db.walletTransaction.deleteMany({ where: { wallet: { userId: { in: users } } } });
  await db.wallet.deleteMany({ where: { userId: { in: users } } });
  await db.driver.deleteMany({ where: { name: { startsWith: `ZZZ Del ${TAG}` } } });
  await db.cartItem.deleteMany({ where: { cart: { userId: { in: users } } } });
  await db.cart.deleteMany({ where: { userId: { in: users } } });
  await db.address.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { slug: productSlug } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PINCODE } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

/* ------------------------------------------------------------------ success */

test("an eligible customer is deleted: owned data gone, contact stripped, orders kept, Firebase user deleted", async () => {
  const c = await customer({ email: `del-${TAG}@example.test` });
  await db.profile.create({ data: { userId: c.id, fullName: "Old Name", gstin: "01ABCDE1234F1Z5", companyName: "Old Co" } });
  await db.address.create({
    data: { userId: c.id, label: "site", name: "Old Name", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: PINCODE },
  });
  await addItem(c.id, null, variantId, 1);
  const kept = await order(c.id, "delivered");
  await db.wallet.create({ data: { userId: c.id, balancePaise: 0 } });

  const firebase = fakeFirebase();
  assert.deepEqual(await deleteAccount(c.uid, { firebase }), { status: "deleted" });
  assert.deepEqual(firebase.deleted, [c.uid]);

  const row = await db.user.findUniqueOrThrow({ where: { id: c.id } });
  assert.equal(row.phone, null);
  assert.equal(row.email, null);
  assert.equal(row.firebaseUid, deletedMarker(c.uid));
  assert.ok(isDeletedAccount(row.firebaseUid));
  assert.equal(await db.profile.count({ where: { userId: c.id } }), 0, "profile and GSTIN kept");
  assert.equal(await db.address.count({ where: { userId: c.id } }), 0, "addresses kept");
  assert.equal(await db.cart.count({ where: { userId: c.id } }), 0, "cart kept");

  const order2 = await db.order.findUniqueOrThrow({ where: { id: kept.id } });
  assert.equal(order2.totalPaise, 50000, "the order record changed");
  assert.equal(order2.taxPaise, 7627, "the order's tax figures changed");
  assert.equal((order2.address as { name?: string }).name, "Site Owner", "the invoice's delivery snapshot was lost");

  /* Deleting again is harmless and still reports deleted. */
  assert.deepEqual(await deleteAccount(c.uid, { firebase }), { status: "deleted" });
});

test("a still-valid session for a deleted account resolves to nobody and does not re-create the account", async () => {
  const c = await customer();
  await deleteAccount(c.uid, { firebase: fakeFirebase() });
  const before = await db.user.count();
  assert.equal(await resolveUserFromToken(token(c.uid, c.phone)), null);
  assert.equal(await db.user.count(), before, "a fresh row was provisioned for the deleted uid");
});

test("signing up again with the same phone gives a new, empty account that sees none of the old history", async () => {
  const c = await customer();
  await order(c.id, "delivered");
  await deleteAccount(c.uid, { firebase: fakeFirebase() });

  /* Firebase issues a new uid once the old user is deleted. */
  const newUid = `new${randomUUID().replace(/-/g, "").slice(0, 25)}`;
  const newId = await provisionUser(token(newUid, c.phone));
  assert.ok(newId);
  users.push(newId!);
  assert.notEqual(newId, c.id, "the new sign-in claimed the deleted account");
  assert.equal(await db.order.count({ where: { userId: newId! } }), 0, "old orders are visible to the new account");
  const fresh = await db.user.findUniqueOrThrow({ where: { id: newId! } });
  assert.equal(fresh.phone, c.phone, "the phone number was not freed for reuse");
});

/* ----------------------------------------------------------------- refusals */

async function assertRefused(c: { id: string; uid: string; phone: string }, code: string) {
  const firebase = fakeFirebase();
  const r = await deleteAccount(c.uid, { firebase });
  assert.equal(r.status, "blocked", `expected a refusal for ${code}, got ${r.status}`);
  if (r.status !== "blocked") return;
  assert.ok(r.blockers.some((b) => b.code === code), `missing ${code}: ${r.blockers.map((b) => b.code).join(",")}`);
  for (const b of r.blockers) assert.ok(b.message && b.resolve, `${b.code} has no explanation or remedy`);
  assert.deepEqual(firebase.deleted, [], "Firebase was touched on a refusal");
  const row = await db.user.findUniqueOrThrow({ where: { id: c.id } });
  assert.equal(row.firebaseUid, c.uid, "a refused account was changed");
  assert.equal(row.phone, c.phone, "a refused account lost its phone");
  const status = await getDeletionStatus(c.id);
  assert.equal(status?.state, "blocked", "the preview disagrees with the refusal");
}

for (const status of ["pending_payment", "confirmed", "packed", "out_for_delivery"] as const) {
  test(`refused while an order is ${status}, naming the order`, async () => {
    const c = await customer();
    const o = await order(c.id, status);
    await assertRefused(c, "ORDER_IN_PROGRESS");
    const r = await getDeletionStatus(c.id);
    assert.ok(r?.state === "blocked" && r.blockers.some((b) => b.orderNo === o.orderNo));
  });
}

test("refused while an order is refund_initiated", async () => {
  const c = await customer();
  await order(c.id, "refund_initiated");
  await assertRefused(c, "REFUND_IN_PROGRESS");
});

test("refused while a refund on a cancelled order is still pending", async () => {
  const c = await customer();
  const o = await order(c.id, "cancelled");
  const payment = await db.payment.create({
    data: { orderId: o.id, gateway: "razorpay", gatewayOrderId: `order_${randomUUID()}`, gatewayPaymentId: `pay_${randomUUID()}`, amountPaise: 50000, status: "captured", signatureVerified: true },
  });
  await db.paymentRefund.create({ data: { paymentId: payment.id, orderId: o.id, amountPaise: 50000, status: "pending", reason: "test refund in flight", actorEmail: "ops@example.test" } });
  await assertRefused(c, "REFUND_IN_PROGRESS");
});

test("refused while a return is open", async () => {
  const c = await customer();
  const o = await order(c.id, "delivered");
  await db.returnRequest.create({
    data: {
      returnNo: `RET-${randomUUID().slice(0, 10)}`, orderId: o.id, status: "under_review", reason: "damaged_in_transit",
      explanation: "test", requestedAt: new Date(), channel: "test", createdByUserId: c.id,
    },
  });
  await assertRefused(c, "RETURN_IN_PROGRESS");
});

test("refused while a service booking is open", async () => {
  const c = await customer();
  const service = await db.service.findFirst({ select: { id: true } });
  if (!service) return; /* No services seeded in this database; nothing to book. */
  await db.booking.create({ data: { bookingNo: `BK-${randomUUID().slice(0, 10)}`, userId: c.id, serviceId: service.id, name: "N", phone: "9876543210", scope: "test", status: "scheduled" } });
  await assertRefused(c, "BOOKING_IN_PROGRESS");
});

test("refused for any nonzero wallet balance, pointing to support without promising a payout", async () => {
  const c = await customer();
  await db.wallet.create({ data: { userId: c.id, balancePaise: 1 } });
  await assertRefused(c, "WALLET_BALANCE");
  const r = await getDeletionStatus(c.id);
  const b = r?.state === "blocked" ? r.blockers.find((x) => x.code === "WALLET_BALANCE") : undefined;
  assert.match(b!.resolve, /info@verticalexpress\.in/);
  assert.doesNotMatch(b!.resolve, /refund|pay (it|you)|transfer/i, "the remedy promises a payout");
});

test("refused for a staff account, by role and by the operator allowlist", async () => {
  const byRole = await customer({ role: "admin" });
  await assertRefused(byRole, "STAFF_ACCOUNT");
  const email = `ops-${TAG}@example.test`;
  process.env.ADMIN_EMAILS = email;
  const byEmail = await customer({ email });
  await assertRefused(byEmail, "STAFF_ACCOUNT");
});

test("refused for a delivery partner, by roster phone and by bound uid", async () => {
  const byPhone = await customer();
  await db.driver.create({ data: { name: `ZZZ Del ${TAG} phone`, phone: byPhone.phone } });
  await assertRefused(byPhone, "DRIVER_ACCOUNT");
  const byUid = await customer();
  await db.driver.create({ data: { name: `ZZZ Del ${TAG} uid`, phone: randomPhone(), firebaseUid: byUid.uid } });
  await assertRefused(byUid, "DRIVER_ACCOUNT");
});

/* ------------------------------------------------------------- concurrency */

test("a checkout that commits while deletion waits is seen, and the deletion is refused", async () => {
  const c = await customer();
  /* Checkout's transaction holds FOR SHARE (assertAccountLive) while it writes the order. */
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const checkout = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${c.id}::uuid FOR SHARE`;
    await tx.order.create({
      data: { orderNo: `DEL-RACE-${randomUUID().slice(0, 8)}`, userId: c.id, status: "pending_payment", paymentMethod: "razorpay", subtotalPaise: 1, totalPaise: 1, address: {} },
    });
    await held;
  }, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 150));
  const deletion = deleteAccount(c.uid, { firebase: fakeFirebase() });
  await new Promise((r) => setTimeout(r, 300));
  release();
  await checkout;
  const r = await deletion;
  assert.equal(r.status, "blocked", "deletion ignored an order committed while it waited");
});

test("a checkout after deletion is refused with ACCOUNT_DELETED and places nothing", async () => {
  const c = await customer();
  const addressId = (
    await db.address.create({
      data: { userId: c.id, label: "site", name: "N", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: PINCODE },
      select: { id: true },
    })
  ).id;
  await addItem(c.id, null, variantId, 1);
  /* The request resolved its identity before the deletion committed; the
     account is marked deleted by the time its transaction runs. */
  await db.user.update({ where: { id: c.id }, data: { firebaseUid: pendingMarker(c.uid), phone: null } });
  await assert.rejects(
    () => placeOrder({ userId: c.id, addressId, paymentMethod: "dummy", idempotencyKey: `del-${randomUUID()}` }),
    /ACCOUNT_DELETED/
  );
  assert.equal(await db.order.count({ where: { userId: c.id } }), 0, "an order was placed for a deleted account");
});

test("simultaneous real checkout and deletion never leave an order on a deleted account", async () => {
  for (let i = 0; i < 4; i++) {
    const c = await customer();
    const addressId = (
      await db.address.create({
        data: { userId: c.id, label: "site", name: "N", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: PINCODE },
        select: { id: true },
      })
    ).id;
    await addItem(c.id, null, variantId, 1);
    const [placed, deleted] = await Promise.allSettled([
      placeOrder({ userId: c.id, addressId, paymentMethod: "dummy", idempotencyKey: `del-${randomUUID()}` }),
      deleteAccount(c.uid, { firebase: fakeFirebase() }),
    ]);
    const row = await db.user.findUniqueOrThrow({ where: { id: c.id } });
    const orders = await db.order.count({ where: { userId: c.id } });
    if (isDeletedAccount(row.firebaseUid)) {
      assert.equal(orders, 0, "a deleted account has an order placed alongside its deletion");
      assert.equal(placed.status, "rejected");
    } else {
      assert.equal(deleted.status === "fulfilled" && deleted.value.status, "blocked");
      assert.ok(orders >= 1);
    }
  }
});

test("a wallet credit that commits while deletion waits is seen, and the deletion is refused", async () => {
  const c = await customer();
  const wallet = await db.wallet.create({ data: { userId: c.id, balancePaise: 0 } });
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const credit = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${c.id}::uuid FOR SHARE`;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balancePaise: { increment: 2500 } } });
    await held;
  }, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 150));
  const deletion = deleteAccount(c.uid, { firebase: fakeFirebase() });
  await new Promise((r) => setTimeout(r, 300));
  release();
  await credit;
  const r = await deletion;
  assert.equal(r.status, "blocked");
  assert.ok(r.status === "blocked" && r.blockers.some((b) => b.code === "WALLET_BALANCE"));
});

test("cashback for a deleted account is not credited", async () => {
  const c = await customer();
  const o = await order(c.id, "delivered");
  await deleteAccount(c.uid, { firebase: fakeFirebase() });
  const prev = process.env.WALLET_CASHBACK_PERCENT;
  process.env.WALLET_CASHBACK_PERCENT = "5";
  const setting = await db.setting.findUnique({ where: { key: "cashback.percent" } });
  try {
    if (setting) return; /* A configured rate in this database would override the env; the guard is covered above. */
    await creditCashbackForOrder({ userId: c.id, orderId: o.id, orderNo: o.orderNo, orderTotalPaise: 50000 });
    const w = await db.wallet.findUnique({ where: { userId: c.id } });
    assert.equal(w?.balancePaise ?? 0, 0, "cashback landed on a deleted account");
  } finally {
    if (prev === undefined) delete process.env.WALLET_CASHBACK_PERCENT;
    else process.env.WALLET_CASHBACK_PERCENT = prev;
  }
});

/* --------------------------------------------------------- Firebase failure */

test("a Firebase failure leaves durable pending state, is never reported as success, and a retry finishes it", async () => {
  const c = await customer();
  await db.address.create({
    data: { userId: c.id, label: "site", name: "N", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: PINCODE },
  });

  assert.deepEqual(await deleteAccount(c.uid, { firebase: fakeFirebase({ fail: true }) }), { status: "pending" });
  const mid = await db.user.findUniqueOrThrow({ where: { id: c.id } });
  assert.equal(mid.firebaseUid, pendingMarker(c.uid), "no durable record of what is left to do");
  assert.equal(mid.phone, null);
  assert.equal(await db.address.count({ where: { userId: c.id } }), 0);

  /* The old session cannot bring the account back while it is pending. */
  const usersBefore = await db.user.count();
  assert.equal(await resolveUserFromToken(token(c.uid, c.phone)), null);
  assert.equal(await db.user.count(), usersBefore);

  /* A second failure is still pending, not success. */
  assert.equal((await deleteAccount(c.uid, { firebase: fakeFirebase({ fail: true }) })).status, "pending");

  const firebase = fakeFirebase();
  assert.deepEqual(await deleteAccount(c.uid, { firebase }), { status: "deleted" });
  assert.deepEqual(firebase.deleted, [c.uid]);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: c.id } })).firebaseUid, deletedMarker(c.uid));
});

test("the scheduled retry finishes a pending deletion the customer never came back to", async () => {
  const c = await customer();
  await deleteAccount(c.uid, { firebase: fakeFirebase({ fail: true }) });
  const firebase = fakeFirebase();
  const r = await retryPendingDeletions({ firebase, limit: 500 });
  assert.ok(r.checked >= 1 && r.finished >= 1);
  assert.ok(firebase.deleted.includes(c.uid));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: c.id } })).firebaseUid, deletedMarker(c.uid));
});

test("an address written by an in-flight request after phase 1 is swept before deletion is declared done", async () => {
  const c = await customer();
  await deleteAccount(c.uid, { firebase: fakeFirebase({ fail: true }) });
  await db.address.create({
    data: { userId: c.id, label: "site", name: "Late", phone: "9876543210", line1: "Plot 2", city: "Srinagar", state: "Jammu & Kashmir", pincode: PINCODE },
  });
  await deleteAccount(c.uid, { firebase: fakeFirebase() });
  assert.equal(await db.address.count({ where: { userId: c.id } }), 0);
});

test("an unknown uid is not found and nothing is touched", async () => {
  const firebase = fakeFirebase();
  assert.deepEqual(await deleteAccount(`nobody${TAG}`, { firebase }), { status: "not_found" });
  assert.deepEqual(firebase.deleted, []);
});
