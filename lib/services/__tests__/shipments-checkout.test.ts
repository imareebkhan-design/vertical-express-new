/**
 * Shipment splitting, end to end through a real checkout.
 *
 * The pure planner is covered in shipments.test.ts. This proves the wiring: that
 * placeOrder actually records the split, inside the same transaction as the order,
 * with quantities that match the order lines.
 *
 * Without this, the planner could be perfect and the cart could still promise a
 * split that was never written.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem } from "../cart";
import { placeOrder } from "../checkout";

const TEST_PINCODE = "999905";
const TEST_USER = randomUUID();

let warehouseId: string;
let addressId: string;
let bulkProductId: string;
let bulkVariantId: string;
let smallProductId: string;
let smallVariantId: string;

const savedEnv: Record<string, string | undefined> = {};

before(async () => {
  savedEnv.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";

  // Real categories from the seed, one of each kind — the split rule reads
  // Category.isBulk, so the fixture must exercise the real flag rather than a stub.
  const bulkCategory = await db.category.findFirst({ where: { isBulk: true }, select: { id: true } });
  const smallCategory = await db.category.findFirst({
    where: { isBulk: false },
    select: { id: true },
  });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!bulkCategory || !smallCategory || !brand) {
    throw new Error("Seed must provide a bulk category, a non-bulk category and a brand.");
  }

  await db.user.create({
    data: {
      id: TEST_USER,
      phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: `shipsplit_${randomUUID()}@example.com`,
    },
  });

  const wh = await db.warehouse.create({
    data: { name: "Split Test Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = wh.id;

  await db.serviceablePincode.create({
    data: { pincode: TEST_PINCODE, warehouseId, isActive: true, codAllowed: true },
  });

  const address = await db.address.create({
    data: {
      userId: TEST_USER,
      name: "Split Buyer",
      phone: "9876543210",
      line1: "Plot 9",
      city: "Srinagar",
      state: "Jammu & Kashmir",
      pincode: TEST_PINCODE,
      isDefault: true,
    },
  });
  addressId = address.id;

  const heavy = await db.product.create({
    data: {
      title: "Split Test Cement",
      slug: `split-cement-${Date.now()}`,
      description: "Heavy fixture",
      categoryId: bulkCategory.id,
      brandId: brand.id,
    },
  });
  bulkProductId = heavy.id;
  const heavyVariant = await db.productVariant.create({
    data: { productId: bulkProductId, name: "50kg", sku: `SKU-HVY-${Date.now()}`, pricePaise: 46500 },
  });
  bulkVariantId = heavyVariant.id;

  const small = await db.product.create({
    data: {
      title: "Split Test Switch",
      slug: `split-switch-${Date.now()}`,
      description: "Small fixture",
      categoryId: smallCategory.id,
      brandId: brand.id,
    },
  });
  smallProductId = small.id;
  const smallVariant = await db.productVariant.create({
    data: { productId: smallProductId, name: "16A", sku: `SKU-SML-${Date.now()}`, pricePaise: 23500 },
  });
  smallVariantId = smallVariant.id;

  await db.inventory.createMany({
    data: [
      { variantId: bulkVariantId, warehouseId, qtyOnHand: 200 },
      { variantId: smallVariantId, warehouseId, qtyOnHand: 200 },
    ],
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
  await db.order.deleteMany({ where: { userId: TEST_USER } });
  await db.cartItem.deleteMany({ where: { cart: { userId: TEST_USER } } });
  await db.cart.deleteMany({ where: { userId: TEST_USER } });
  await db.address.deleteMany({ where: { userId: TEST_USER } });
  await db.serviceablePincode.deleteMany({ where: { pincode: TEST_PINCODE } });
  for (const v of [bulkVariantId, smallVariantId]) {
    if (v) {
      await db.inventory.deleteMany({ where: { variantId: v } });
      await db.productVariant.delete({ where: { id: v } });
    }
  }
  for (const p of [bulkProductId, smallProductId]) {
    if (p) await db.product.delete({ where: { id: p } });
  }
  if (warehouseId) await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: TEST_USER } });
});

async function clearCart() {
  await db.cartItem.deleteMany({ where: { cart: { userId: TEST_USER } } });
}

test("Shipments: a mixed order is recorded as two shipments with the right lines", async () => {
  await clearCart();
  await addItem(TEST_USER, null, smallVariantId, 3);
  await addItem(TEST_USER, null, bulkVariantId, 34);

  const result = await placeOrder({
    userId: TEST_USER,
    addressId,
    paymentMethod: "dummy",
    idempotencyKey: `split-mixed-${randomUUID()}`,
  });

  const order = await db.order.findUniqueOrThrow({
    where: { orderNo: result.orderNo },
    include: {
      shipments: { orderBy: { sequence: "asc" }, include: { items: true } },
      items: true,
    },
  });

  assert.equal(order.shipments.length, 2, "a mixed order must split into two shipments");

  const [first, second] = order.shipments;
  assert.equal(first.speedClass, "express", "the delivery arriving today comes first");
  assert.equal(first.sequence, 1);
  assert.equal(second.speedClass, "scheduled");
  assert.equal(second.sequence, 2);

  // Every order line must appear in exactly one shipment, at its full quantity.
  const shipped = [...first.items, ...second.items];
  assert.equal(shipped.length, order.items.length, "no line may be dropped from the split");

  for (const item of order.items) {
    const matches = shipped.filter((s) => s.orderItemId === item.id);
    assert.equal(matches.length, 1, `${item.title} should be in exactly one shipment`);
    assert.equal(matches[0].qty, item.qty, `${item.title} quantity must survive the split`);
  }

  const smallLine = order.items.find((i) => i.variantId === smallVariantId);
  assert.ok(
    first.items.some((s) => s.orderItemId === smallLine?.id),
    "the small item belongs to the express shipment"
  );
});

test("Shipments: an order of only heavy goods gets a single scheduled shipment", async () => {
  await clearCart();
  await addItem(TEST_USER, null, bulkVariantId, 10);

  const result = await placeOrder({
    userId: TEST_USER,
    addressId,
    paymentMethod: "dummy",
    idempotencyKey: `split-heavy-${randomUUID()}`,
  });

  const order = await db.order.findUniqueOrThrow({
    where: { orderNo: result.orderNo },
    include: { shipments: { include: { items: true } } },
  });

  assert.equal(order.shipments.length, 1);
  assert.equal(order.shipments[0].speedClass, "scheduled");
  assert.equal(
    order.shipments[0].sequence,
    1,
    "a single shipment is 1 of 1 — never 'Shipment 2 of 1'"
  );
});

test("Shipments: a failed order writes no shipments", async () => {
  await clearCart();
  await addItem(TEST_USER, null, bulkVariantId, 5);

  const before = await db.shipment.count({ where: { order: { userId: TEST_USER } } });

  // An unserviceable address cannot resolve a warehouse, so placeOrder rejects
  // before the transaction opens.
  const orphanAddress = await db.address.create({
    data: {
      userId: TEST_USER,
      name: "Nowhere",
      phone: "9876543210",
      line1: "Unserved",
      city: "Nowhere",
      state: "Jammu & Kashmir",
      pincode: "999999",
    },
  });

  await assert.rejects(() =>
    placeOrder({
      userId: TEST_USER,
      addressId: orphanAddress.id,
      paymentMethod: "dummy",
      idempotencyKey: `split-fail-${randomUUID()}`,
    })
  );

  const after = await db.shipment.count({ where: { order: { userId: TEST_USER } } });
  assert.equal(after, before, "a rejected order must leave no shipments behind");

  await db.address.delete({ where: { id: orphanAddress.id } });
});
