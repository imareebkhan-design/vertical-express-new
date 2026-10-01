/**
 * E6 — coupons through a real placement: what is charged, what is recorded,
 * and what is used up.
 *
 * Existing suites pin the rules one level down (`coupon-limits`,
 * `coupon-redemption`, `coupon-release`, `coupon-checkout`). These tests go
 * through `placeOrder` and check the order, its lines, its payment and the
 * coupon's use together, for the cases a customer can actually reach.
 *
 * All coupons here are local fixtures (`ZZZE6…`), created and deleted by this
 * file. No rule is invented: each test exercises a field the coupon model
 * already has (type, value, limits, dates) with the meaning the engine already
 * gives it.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem, getCartSummary } from "../cart";
import { placeOrder, computeTotals } from "../checkout";

const PINCODE = "999916";
const STATE = "Jammu & Kashmir";
const USER = randomUUID();
const OTHER = randomUUID();
const TAG = `ZZZE6${Date.now() % 1_000_000}`;
const FEE = 4900;

let warehouseId: string;
let addressId: string;
let otherAddressId: string;
const productIds: string[] = [];
const variants: Record<"cheap" | "cement" | "fitting", string> = { cheap: "", cement: "", fitting: "" };
const savedEnv: Record<string, string | undefined> = {};

async function clearCart(userId: string) {
  await db.cartItem.deleteMany({ where: { cart: { userId } } });
}

async function coupon(code: string, data: Record<string, unknown>) {
  return db.coupon.create({ data: { code, isActive: true, minOrderPaise: 0, ...data } as never });
}

const redemptions = (couponCode: string) => db.couponRedemption.count({ where: { coupon: { code: couponCode } } });
const counter = async (couponCode: string) => (await db.coupon.findUniqueOrThrow({ where: { code: couponCode } })).redeemedCount;
const stockOf = async (variantId: string) =>
  (await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand;

before(async () => {
  savedEnv.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";

  const brand = await db.brand.findFirst({ select: { id: true } });
  const cement = await db.category.findFirst({ where: { slug: "cement" }, select: { id: true } });
  const other = await db.category.findFirst({ where: { slug: { not: "cement" }, isBulk: false }, select: { id: true } });
  if (!brand || !cement || !other) throw new Error("Seed must provide a brand, the cement category and one other.");

  await db.user.createMany({
    data: [
      { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
      { id: OTHER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
    ],
  });
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} Warehouse`, city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({
    data: { pincode: PINCODE, warehouseId, isActive: true, codAllowed: true, deliveryFeePaise: FEE },
  });
  await db.setting.upsert({
    where: { key: "cod.enabled" },
    create: { key: "cod.enabled", value: "true" },
    update: { value: "true" },
  });
  const mkAddr = async (userId: string) =>
    (await db.address.create({
      data: { userId, name: "E6 Buyer", phone: "9876543210", line1: "Plot 6", city: "Srinagar", state: STATE, pincode: PINCODE, isDefault: true },
    })).id;
  addressId = await mkAddr(USER);
  otherAddressId = await mkAddr(OTHER);

  const mk = async (key: keyof typeof variants, categoryId: string, pricePaise: number) => {
    const p = await db.product.create({
      data: { title: `${TAG} ${key}`, slug: `${TAG.toLowerCase()}-${key}`, categoryId, brandId: brand.id },
    });
    productIds.push(p.id);
    const v = await db.productVariant.create({ data: { productId: p.id, name: "Unit", sku: `${TAG}-${key}`, pricePaise } });
    await db.inventory.create({ data: { variantId: v.id, warehouseId, qtyOnHand: 500 } });
    variants[key] = v.id;
  };
  await mk("cheap", other.id, 30000); // ₹300 — under the ₹500 free-delivery threshold
  await mk("cement", cement.id, 32000); // 28% GST
  await mk("fitting", other.id, 11800); // 18% GST (or the category's rate)
});

beforeEach(async () => {
  await clearCart(USER);
  await clearCart(OTHER);
});

after(async () => {
  if (savedEnv.PAYMENT_GATEWAY === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedEnv.PAYMENT_GATEWAY;
  const users = [USER, OTHER];
  await db.couponRedemption.deleteMany({ where: { userId: { in: users } } });
  await db.shipmentItem.deleteMany({ where: { shipment: { order: { userId: { in: users } } } } });
  await db.shipment.deleteMany({ where: { order: { userId: { in: users } } } });
  await db.orderItem.deleteMany({ where: { order: { userId: { in: users } } } });
  await db.payment.deleteMany({ where: { order: { userId: { in: users } } } });
  await db.orderStatusEvent.deleteMany({ where: { order: { userId: { in: users } } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.order.deleteMany({ where: { userId: { in: users } } });
  await db.cartItem.deleteMany({ where: { cart: { userId: { in: users } } } });
  await db.cart.deleteMany({ where: { userId: { in: users } } });
  await db.address.deleteMany({ where: { userId: { in: users } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PINCODE } });
  await db.coupon.deleteMany({ where: { code: { startsWith: TAG } } });
  for (const v of Object.values(variants).filter(Boolean)) {
    await db.stockMovement.deleteMany({ where: { variantId: v } }).catch(() => {});
    await db.inventory.deleteMany({ where: { variantId: v } });
    await db.productVariant.delete({ where: { id: v } });
  }
  for (const p of productIds) await db.product.delete({ where: { id: p } });
  await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
});

test("mixed GST rates + percent coupon: the order, its lines and its payment agree with the quote to the paisa", async () => {
  const code = `${TAG}PCT10`;
  await coupon(code, { type: "percent", value: 10 });
  await addItem(USER, null, variants.cement, 1);
  await addItem(USER, null, variants.fitting, 1);
  const cart = await getCartSummary(USER, null);
  const quote = await computeTotals(cart, PINCODE, STATE, code, USER);

  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: randomUUID() });
  const order = await db.order.findFirstOrThrow({ where: { orderNo: placed.orderNo }, include: { items: true, payments: true } });

  assert.equal(order.discountPaise, quote.discountPaise, "discount as quoted");
  assert.equal(order.discountPaise, Math.round((cart.subtotalPaise * 10) / 100), "10% of the goods, once");
  assert.equal(order.taxPaise, quote.taxPaise, "GST as quoted (server calculation, per line after the discount)");
  assert.equal(order.totalPaise, quote.totalPaise, "total as quoted");
  assert.equal(order.totalPaise, order.subtotalPaise + order.taxPaise + order.deliveryFeePaise, "total = taxable + GST + delivery");
  assert.equal(order.subtotalPaise + order.taxPaise + order.discountPaise, cart.subtotalPaise, "items at shelf price − discount = taxable + GST");
  assert.equal(order.items.reduce((s, i) => s + (i.discountPaise ?? 0), 0), order.discountPaise, "line discounts sum to the order discount — taken once");
  assert.equal(order.items.reduce((s, i) => s + (i.totalPaise ?? 0), 0), cart.subtotalPaise - order.discountPaise);
  assert.equal(order.payments[0].amountPaise, order.totalPaise, "the payment asks for exactly the order total");
  assert.equal(order.couponCode, code);
  assert.equal(await redemptions(code), 1);
  assert.equal(await counter(code), 1);
});

test("the same order placed twice with one idempotency key: one order, one payment, one coupon use", async () => {
  const code = `${TAG}IDEM`;
  await coupon(code, { type: "flat", value: 5000, perUserLimit: 1 });
  await addItem(USER, null, variants.cement, 2);
  const key = randomUUID();
  const first = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: key });
  await addItem(USER, null, variants.cement, 2); // the cart is refilled, as if the customer went back
  const again = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: key });

  assert.equal(again.orderNo, first.orderNo);
  const orders = await db.order.findMany({ where: { idempotencyKey: key }, include: { payments: true } });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].payments.length, 1);
  assert.equal(await redemptions(code), 1, "a replay does not spend the coupon again");
  assert.equal(await counter(code), 1);
});

test("a free-delivery coupon is used up like any other: its per-customer limit holds", async () => {
  const code = `${TAG}FREEDEL`;
  await coupon(code, { type: "free_delivery", value: 0, perUserLimit: 1 });

  await addItem(USER, null, variants.cheap, 1); // ₹300, below the ₹500 threshold: delivery is charged
  const quote = await computeTotals(await getCartSummary(USER, null), PINCODE, STATE, code, USER);
  assert.equal(quote.deliveryFeePaise, 0, "the coupon waives the fee");
  const first = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: randomUUID() });
  const o1 = await db.order.findFirstOrThrow({ where: { orderNo: first.orderNo } });
  assert.equal(o1.deliveryFeePaise, 0);
  assert.equal(o1.couponCode, code, "the order records the coupon that waived its delivery");
  assert.equal(await redemptions(code), 1, "the use is recorded");
  assert.equal(await counter(code), 1);

  await addItem(USER, null, variants.cheap, 1);
  /* Submitting it again is refused (revalidation) rather than silently charged
     the fee; placed without it, the fee is charged. */
  await assert.rejects(
    placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: randomUUID() }),
    /COUPON_NOT_APPLICABLE:per_user_limit_reached/
  );
  const second = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: null, idempotencyKey: randomUUID() });
  const o2 = await db.order.findFirstOrThrow({ where: { orderNo: second.orderNo } });
  assert.equal(o2.deliveryFeePaise, FEE, "a one-per-customer coupon does not waive delivery a second time");
  assert.equal(o2.couponCode, null);
  assert.equal(await redemptions(code), 1);
});

test("a free-delivery coupon on an order that already has free delivery takes nothing and spends nothing", async () => {
  const code = `${TAG}FREEDEL2`;
  await coupon(code, { type: "free_delivery", value: 0, perUserLimit: 1 });
  await addItem(USER, null, variants.cement, 2); // ₹640 — already over the threshold
  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: randomUUID() });
  const o = await db.order.findFirstOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(o.deliveryFeePaise, 0);
  assert.equal(o.couponCode, null, "nothing was waived by the coupon");
  assert.equal(await redemptions(code), 0);
});

/* ------------------------------------------------ revalidation at placement */

/** What a rejected submission must leave untouched. */
async function snapshot(code: string) {
  return {
    orders: await db.order.count({ where: { userId: USER } }),
    payments: await db.payment.count({ where: { order: { userId: USER } } }),
    stock: await stockOf(variants.cement),
    redemptions: await redemptions(code),
    counter: await counter(code),
    cartLines: (await getCartSummary(USER, null)).lines.length,
  };
}

/**
 * A coupon the customer applied and saw in the quote stops qualifying before
 * they press "place order". Placement must stop — not charge the higher total
 * the customer never saw — and write nothing: no order, no payment row, no
 * gateway order, no stock, no coupon use. The customer then places again,
 * explicitly, without it.
 *
 * The gateway claim is checked by making the gateway unusable: the active
 * gateway is razorpay-test with no keys, so reaching `createOrder` would throw a
 * configuration error instead of the coupon refusal.
 */
async function expectRejectedThenRevised(code: string, reason: string, change: () => Promise<void>) {
  await clearCart(USER);
  await addItem(USER, null, variants.cement, 2); // ₹640
  const preview = await computeTotals(await getCartSummary(USER, null), PINCODE, STATE, code, USER);
  assert.ok(preview.discountPaise > 0, `${code}: the preview applied the coupon`);
  assert.equal(preview.couponRejection, null);

  await change(); // expiry / switch-off / claimed out / basket change, between preview and placement

  const before = await snapshot(code);
  const saved = { gw: process.env.PAYMENT_GATEWAY, id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  process.env.PAYMENT_GATEWAY = "razorpay-test";
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  try {
    await assert.rejects(
      placeOrder({ userId: USER, addressId, paymentMethod: "razorpay-test", couponCode: code, idempotencyKey: randomUUID() }),
      new RegExp(`^Error: COUPON_NOT_APPLICABLE:${reason}$`),
      `${code}: refused with the reason, before any gateway call`
    );
  } finally {
    for (const [k, v] of [["PAYMENT_GATEWAY", saved.gw], ["RAZORPAY_KEY_ID", saved.id], ["RAZORPAY_KEY_SECRET", saved.secret]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  assert.deepEqual(await snapshot(code), before, `${code}: nothing written — no order, payment, stock, coupon use; cart kept`);

  /* The re-quote the customer is shown, and their explicit second submission. */
  const revised = await computeTotals(await getCartSummary(USER, null), PINCODE, STATE, code, USER);
  assert.equal(revised.couponRejection, reason, `${code}: the quote says why`);
  assert.equal(revised.discountPaise, 0);
  const noCoupon = await computeTotals(await getCartSummary(USER, null), PINCODE, STATE, null, USER);
  assert.equal(revised.totalPaise, noCoupon.totalPaise, `${code}: the revised total is the no-coupon total`);
  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: null, idempotencyKey: randomUUID() });
  const o = await db.order.findFirstOrThrow({ where: { orderNo: placed.orderNo }, include: { payments: true } });
  assert.equal(o.totalPaise, revised.totalPaise, `${code}: placed at exactly the revised quote`);
  assert.equal(o.payments[0].amountPaise, revised.totalPaise);
  assert.equal(o.couponCode, null);
  assert.equal(await redemptions(code), before.redemptions, `${code}: still nothing spent`);
}

test("revalidation: a coupon that expired after the preview stops placement; nothing written; revised total placed explicitly", async () => {
  const code = `${TAG}EXPIRES`;
  await coupon(code, { type: "flat", value: 5000 });
  await expectRejectedThenRevised(code, "not_found", async () => {
    await db.coupon.update({ where: { code }, data: { endsAt: new Date(Date.now() - 1000) } });
  });
});

test("revalidation: a coupon switched off after the preview stops placement", async () => {
  const code = `${TAG}OFF`;
  await coupon(code, { type: "flat", value: 5000 });
  await expectRejectedThenRevised(code, "not_found", async () => {
    await db.coupon.update({ where: { code }, data: { isActive: false } });
  });
});

test("revalidation: a coupon claimed out by another customer after the preview stops placement", async () => {
  const code = `${TAG}CLAIMED`;
  await coupon(code, { type: "flat", value: 5000, usageLimit: 1 });
  await expectRejectedThenRevised(code, "usage_limit_reached", async () => {
    await clearCart(OTHER);
    await addItem(OTHER, null, variants.cement, 1);
    await placeOrder({ userId: OTHER, addressId: otherAddressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: randomUUID() });
  });
});

test("revalidation: a basket changed below the coupon's minimum after the preview stops placement", async () => {
  const code = `${TAG}MIN600`;
  await coupon(code, { type: "flat", value: 5000, minOrderPaise: 60000 }); // ₹600; the basket is ₹640
  await expectRejectedThenRevised(code, "below_minimum", async () => {
    const cart = await db.cart.findFirstOrThrow({ where: { userId: USER } });
    await db.cartItem.updateMany({ where: { cartId: cart.id, variantId: variants.cement }, data: { qty: 1 } }); // ₹320
  });
});

test("revalidation: the customer's own per-customer limit reached in another tab after the preview stops placement", async () => {
  const perUser = `${TAG}ONCE`;
  await coupon(perUser, { type: "flat", value: 5000, perUserLimit: 1 });
  await expectRejectedThenRevised(perUser, "per_user_limit_reached", async () => {
    /* The same customer spends it in another tab. */
    const cart = await getCartSummary(USER, null);
    assert.ok(cart.lines.length > 0);
    await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: perUser, idempotencyKey: randomUUID() });
    await addItem(USER, null, variants.cement, 2); // the basket they were looking at
  });
});

test("an unknown code submitted at placement is refused, not silently ignored", async () => {
  await clearCart(USER);
  await addItem(USER, null, variants.cement, 1);
  const before = await db.order.count({ where: { userId: USER } });
  await assert.rejects(
    placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: "NOT-A-REAL-COUPON", idempotencyKey: randomUUID() }),
    /^Error: COUPON_NOT_APPLICABLE:not_found$/
  );
  assert.equal(await db.order.count({ where: { userId: USER } }), before);
});

test("no coupon at all: placement is unchanged", async () => {
  await clearCart(USER);
  await addItem(USER, null, variants.cement, 1);
  const quote = await computeTotals(await getCartSummary(USER, null), PINCODE, STATE, null, USER);
  assert.equal(quote.couponRejection, null);
  for (const couponCode of [null, undefined, ""]) {
    await addItem(USER, null, variants.cement, 1);
    const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode, idempotencyKey: randomUUID() });
    const o = await db.order.findFirstOrThrow({ where: { orderNo: placed.orderNo } });
    assert.equal(o.couponCode, null);
    await clearCart(USER);
  }
});

test("an order already created with a coupon still replays after the coupon expires", async () => {
  const code = `${TAG}REPLAY`;
  await coupon(code, { type: "flat", value: 5000 });
  await clearCart(USER);
  await addItem(USER, null, variants.cement, 1);
  const key = randomUUID();
  const first = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: key });
  await db.coupon.update({ where: { code }, data: { isActive: false } });
  await addItem(USER, null, variants.cement, 1);
  const again = await placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: key });
  assert.equal(again.orderNo, first.orderNo, "the replay returns the order that was created, not a refusal");
  assert.equal(await db.order.count({ where: { idempotencyKey: key } }), 1);
  assert.equal(await redemptions(code), 1);
});

test("a use lost to a concurrent order at placement fails the order: nothing created, no stock taken, nothing spent", async () => {
  const code = `${TAG}RACE`;
  /* The preview counts orders; placement takes the use with a guarded
     increment. Here the counter already stands at the limit with no order
     behind it — exactly what a winning concurrent placement looks like from
     the loser's side between its check and its write. */
  await coupon(code, { type: "flat", value: 5000, usageLimit: 1, redeemedCount: 1 });
  await addItem(USER, null, variants.cement, 1);
  const stock0 = await stockOf(variants.cement);
  const orders0 = await db.order.count({ where: { userId: USER } });

  await assert.rejects(
    placeOrder({ userId: USER, addressId, paymentMethod: "dummy", couponCode: code, idempotencyKey: randomUUID() }),
    /COUPON_UNAVAILABLE:exhausted/
  );
  assert.equal(await db.order.count({ where: { userId: USER } }), orders0, "no order");
  assert.equal(await stockOf(variants.cement), stock0, "no stock taken");
  assert.equal(await redemptions(code), 0);
  assert.equal(await counter(code), 1);
  assert.equal((await getCartSummary(USER, null)).lines.length, 1, "the cart is kept for the customer to retry");
});
