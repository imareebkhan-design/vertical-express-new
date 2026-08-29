/**
 * Coupons, end to end through a real checkout — ISS-011.
 *
 * The register called the coupon engine "unreachable dead code". It was worse
 * than that: it was reachable and misleading. `validateCoupon` returned a
 * discounted total, the UI announced "Coupon applied!", and then `placeOrder`
 * was called without the code — so `computeTotals` received `undefined`,
 * `discountPaise` came back 0, and the customer was charged full price for the
 * total they had just been shown as discounted.
 *
 * These tests pin the property that failure violated: the discount a customer is
 * shown is the discount the placed order actually carries.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem, getCartSummary } from "../cart";
import { placeOrder, computeTotals } from "../checkout";

const TEST_PINCODE = "999907";
const TEST_USER = randomUUID();
const COUPON_CODE = `AUDITSAVE${Date.now() % 100000}`;

let warehouseId: string;
let addressId: string;
let productId: string;
let variantId: string;
const savedEnv: Record<string, string | undefined> = {};

before(async () => {
  savedEnv.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";

  const category = await db.category.findFirst({ where: { isBulk: false }, select: { id: true } });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!category || !brand) throw new Error("Seed must provide a category and a brand.");

  await db.user.create({
    data: {
      id: TEST_USER,
      phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: `coupon_${randomUUID()}@example.com`,
    },
  });

  const wh = await db.warehouse.create({
    data: { name: "Coupon Test Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = wh.id;

  await db.serviceablePincode.create({
    data: { pincode: TEST_PINCODE, warehouseId, isActive: true, codAllowed: true },
  });

  const address = await db.address.create({
    data: {
      userId: TEST_USER,
      name: "Coupon Buyer",
      phone: "9876543210",
      line1: "Plot 7",
      city: "Srinagar",
      state: "Jammu & Kashmir",
      pincode: TEST_PINCODE,
      isDefault: true,
    },
  });
  addressId = address.id;

  const product = await db.product.create({
    data: {
      title: "Coupon Test Switch",
      slug: `coupon-switch-${Date.now()}`,
      description: "Fixture",
      categoryId: category.id,
      brandId: brand.id,
    },
  });
  productId = product.id;
  const variant = await db.productVariant.create({
    data: { productId, name: "16A", sku: `SKU-CPN-${Date.now()}`, pricePaise: 100000 },
  });
  variantId = variant.id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 500 } });

  await db.coupon.create({
    data: { code: COUPON_CODE, type: "flat", value: 25000, minOrderPaise: 0, isActive: true },
  });
});

after(async () => {
  if (savedEnv.PAYMENT_GATEWAY === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedEnv.PAYMENT_GATEWAY;

  await db.shipmentItem.deleteMany({ where: { shipment: { order: { userId: TEST_USER } } } });
  await db.shipment.deleteMany({ where: { order: { userId: TEST_USER } } });
  await db.orderItem.deleteMany({ where: { order: { userId: TEST_USER } } });
  await db.payment.deleteMany({ where: { order: { userId: TEST_USER } } });
  await db.orderStatusEvent.deleteMany({ where: { order: { userId: TEST_USER } } });
  await db.auditLog.deleteMany({ where: { actorId: TEST_USER } });
  await db.order.deleteMany({ where: { userId: TEST_USER } });
  await db.cartItem.deleteMany({ where: { cart: { userId: TEST_USER } } });
  await db.cart.deleteMany({ where: { userId: TEST_USER } });
  await db.address.deleteMany({ where: { userId: TEST_USER } });
  await db.serviceablePincode.deleteMany({ where: { pincode: TEST_PINCODE } });
  await db.coupon.deleteMany({ where: { code: COUPON_CODE } });
  if (variantId) {
    await db.inventory.deleteMany({ where: { variantId } });
    await db.productVariant.delete({ where: { id: variantId } });
  }
  if (productId) await db.product.delete({ where: { id: productId } });
  if (warehouseId) await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.delete({ where: { id: TEST_USER } });
});

test("Coupons: the discount shown at checkout is the discount the order is charged", async () => {
  await addItem(TEST_USER, null, variantId, 2); // ₹2,000.00

  // What the customer is shown when they apply the code.
  const cart = await getCartSummary(TEST_USER, null);
  const preview = await computeTotals(cart, TEST_PINCODE, "Jammu & Kashmir", COUPON_CODE);
  assert.equal(preview.discountPaise, 25000, "preview must show the ₹250 discount");

  // What they are actually charged.
  const result = await placeOrder({
    userId: TEST_USER,
    addressId,
    paymentMethod: "cod",
    couponCode: COUPON_CODE,
    idempotencyKey: randomUUID(),
  });

  const order = await db.order.findFirst({ where: { orderNo: result.orderNo } });
  assert.ok(order, "order must exist");
  assert.equal(
    order.discountPaise,
    preview.discountPaise,
    "the charged discount must equal the discount shown — this is the bug ISS-011 was"
  );
  assert.equal(order.totalPaise, preview.totalPaise, "the charged total must equal the shown total");
  assert.equal(order.couponCode, COUPON_CODE, "the order must record which coupon was used");
});

test("Coupons: omitting the code charges full price and records no coupon", async () => {
  await addItem(TEST_USER, null, variantId, 1);

  const result = await placeOrder({
    userId: TEST_USER,
    addressId,
    paymentMethod: "cod",
    idempotencyKey: randomUUID(),
  });

  const order = await db.order.findFirst({ where: { orderNo: result.orderNo } });
  assert.ok(order);
  assert.equal(order.discountPaise, 0);
  assert.equal(order.couponCode, null);
});

test("Coupons: an unknown code is ignored rather than trusted", async () => {
  await addItem(TEST_USER, null, variantId, 1);

  const result = await placeOrder({
    userId: TEST_USER,
    addressId,
    paymentMethod: "cod",
    couponCode: "NOT-A-REAL-COUPON",
    idempotencyKey: randomUUID(),
  });

  const order = await db.order.findFirst({ where: { orderNo: result.orderNo } });
  assert.ok(order);
  assert.equal(order.discountPaise, 0, "an unknown code must not produce a discount");
  assert.equal(order.couponCode, null);
});
