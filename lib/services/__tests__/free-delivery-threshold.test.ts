/**
 * A-5 / ISS-030 — the free-delivery threshold is the owner's setting, and there
 * is no offer until they enter one.
 *
 * It used to be `FREE_DELIVERY_THRESHOLD_PAISE = 50000` in the cart service: a
 * figure nobody chose, which waived the delivery fee at checkout and was
 * reported to the phone app as the shop's offer. These tests pin what replaced
 * it, through the real cart, quote and `placeOrder` against the local test
 * database:
 *
 *   absent      no waiver — the cart says 0 / 0 / false and every basket,
 *               however large, pays its pincode's fee in the quote and on the
 *               order
 *   set         a basket at or above the figure pays no standard fee; one paisa
 *               short pays it in full
 *   changed     the next read uses the new figure — nothing is cached
 *   removed     back to no offer
 *   mid-order   a quote made under one rule is not placed under another: the
 *               total moved, so placement is refused (TOTAL_CHANGED) and nothing
 *               is written
 *   malformed   a stored value that is not a positive whole number of paise is
 *               no offer, never a guess
 *
 * Every amount here is a fixture chosen to sit either side of the test basket.
 * None is a proposed threshold: that figure is the owner's decision (OD-3).
 *
 * The setting row is shared by the whole database, so this file records what it
 * found and puts it back.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem, getCartSummary, freeDeliveryFor, readFreeDeliveryThresholdPaise } from "../cart";
import { placeOrder, computeTotals } from "../checkout";
import { SETTING_KEYS } from "@/lib/services/settings";
import { approveTestProductsCreatedSince } from "../../../test-support/catalogue-fixtures";
import { liveTestCityId } from "@/test-support/service-city";
const SUITE_START = new Date();

const KEY = SETTING_KEYS.freeDeliveryThresholdPaise;
const PINCODE = "999934";
const STATE = "Jammu & Kashmir";
const USER = randomUUID();
const TAG = `ZZZA5${Date.now() % 1_000_000}`;
const FEE = 4900;
const UNIT = 20000;
/** Three units. The basket the boundary tests are built around. */
const BASKET = 3 * UNIT;

let warehouseId: string;
let addressId: string;
let productId: string;
let variantId: string;
const savedEnv: Record<string, string | undefined> = {};
let savedThreshold: Awaited<ReturnType<typeof db.setting.findUnique>>;

/** Store the raw value exactly as given, or remove the row for null. */
async function setThreshold(value: string | null) {
  if (value === null) {
    await db.setting.deleteMany({ where: { key: KEY } });
    return;
  }
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

const cart = () => getCartSummary(USER, null);
const quote = async () => computeTotals(await cart(), PINCODE, STATE, null, USER);
const orders = () => db.order.count({ where: { userId: USER } });
const stock = async () => (await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand;
const place = (expectedTotalPaise?: number, idempotencyKey: string = randomUUID()) =>
  placeOrder({ userId: USER, addressId, paymentMethod: "dummy", idempotencyKey, expectedTotalPaise });

before(async () => {
  savedThreshold = await db.setting.findUnique({ where: { key: KEY } });
  savedEnv.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";
  const brand = await db.brand.findFirst({ select: { id: true } });
  const category = await db.category.findFirst({ where: { isBulk: false }, select: { id: true } });
  if (!brand || !category) throw new Error("Seed must provide a brand and a non-bulk category.");
  await db.user.create({ data: { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` } });
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} Warehouse`, city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({
    data: { cityId: await liveTestCityId(), pincode: PINCODE, warehouseId, isActive: true, codAllowed: true, deliveryFeePaise: FEE },
  });
  addressId = (await db.address.create({
    data: { userId: USER, name: "A5 Buyer", phone: "9876543210", line1: "Plot 5", city: "Srinagar", state: STATE, pincode: PINCODE, isDefault: true },
  })).id;
  productId = (await db.product.create({
    data: { status: "published", title: `${TAG} item`, slug: `${TAG.toLowerCase()}-item`, categoryId: category.id, brandId: brand.id },
  })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Unit", sku: `${TAG}-item`, pricePaise: UNIT } })).id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 1000 } });
  await approveTestProductsCreatedSince(SUITE_START);
});

beforeEach(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await setThreshold(null);
});

after(async () => {
  if (savedThreshold) {
    await db.setting.upsert({ where: { key: KEY }, create: savedThreshold, update: savedThreshold });
  } else {
    await db.setting.deleteMany({ where: { key: KEY } });
  }
  if (savedEnv.PAYMENT_GATEWAY === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedEnv.PAYMENT_GATEWAY;
  const where = { order: { userId: USER } };
  await db.shipmentItem.deleteMany({ where: { shipment: where } });
  await db.shipment.deleteMany({ where });
  await db.orderItem.deleteMany({ where });
  await db.payment.deleteMany({ where });
  await db.orderStatusEvent.deleteMany({ where });
  await db.auditLog.deleteMany({ where: { actorId: USER } });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await db.cart.deleteMany({ where: { userId: USER } });
  await db.address.deleteMany({ where: { userId: USER } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PINCODE } });
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.delete({ where: { id: variantId } });
  await db.product.delete({ where: { id: productId } });
  await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.delete({ where: { id: USER } });
});

/* ------------------------------------------------------------- the pure rule */

test("the rule itself: no threshold is no offer, and the boundary is inclusive", () => {
  const none = { freeDeliveryThresholdPaise: 0, freeDeliveryRemainingPaise: 0, qualifiesFreeDelivery: false };
  assert.deepEqual(freeDeliveryFor(0, null), none);
  assert.deepEqual(freeDeliveryFor(10_000_000, null), none, "no basket is large enough to earn an offer that does not exist");
  assert.deepEqual(freeDeliveryFor(BASKET, 0), none, "zero is not 'always free'");
  assert.deepEqual(freeDeliveryFor(BASKET, -1), none);

  assert.deepEqual(freeDeliveryFor(BASKET - 1, BASKET), {
    freeDeliveryThresholdPaise: BASKET, freeDeliveryRemainingPaise: 1, qualifiesFreeDelivery: false,
  }, "one paisa short does not qualify");
  assert.deepEqual(freeDeliveryFor(BASKET, BASKET), {
    freeDeliveryThresholdPaise: BASKET, freeDeliveryRemainingPaise: 0, qualifiesFreeDelivery: true,
  }, "exactly the threshold qualifies");
  assert.deepEqual(freeDeliveryFor(BASKET + 1, BASKET), {
    freeDeliveryThresholdPaise: BASKET, freeDeliveryRemainingPaise: 0, qualifiesFreeDelivery: true,
  });
  assert.equal(freeDeliveryFor(0, BASKET).qualifiesFreeDelivery, false, "an empty basket qualifies for nothing");
});

/* ------------------------------------------------------------ setting absent */

test("no setting: the cart reports no offer as 0 / 0 / false — numbers, as the phone app's contract types them", async () => {
  assert.equal(await readFreeDeliveryThresholdPaise(), null);

  const empty = await cart();
  assert.deepEqual(
    [empty.freeDeliveryThresholdPaise, empty.freeDeliveryRemainingPaise, empty.qualifiesFreeDelivery],
    [0, 0, false],
    "an empty cart advertises no threshold"
  );

  await addItem(USER, null, variantId, 3);
  const c = await cart();
  assert.equal(c.subtotalPaise, BASKET);
  assert.strictEqual(c.freeDeliveryThresholdPaise, 0);
  assert.strictEqual(c.freeDeliveryRemainingPaise, 0);
  assert.strictEqual(c.qualifiesFreeDelivery, false);
});

test("no setting: a large basket pays the pincode's fee in the quote and on the placed order", async () => {
  await addItem(USER, null, variantId, 50); // ₹10,000 — twenty times the old hardcoded figure
  const c = await cart();
  assert.equal(c.subtotalPaise, 50 * UNIT);
  assert.equal(c.qualifiesFreeDelivery, false);

  const q = await quote();
  assert.equal(q.deliveryFeePaise, FEE, "the quote waived a fee no owner agreed to waive");

  const placed = await place(q.totalPaise);
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(order.deliveryFeePaise, FEE, "the order waived the fee");
  assert.equal(order.totalPaise, q.totalPaise, "the order is placed at the quoted total");
});

/* -------------------------------------------------------- setting configured */

test("threshold set, basket exactly on it: delivery is free in the cart, the quote and the order", async () => {
  await setThreshold(String(BASKET));
  await addItem(USER, null, variantId, 3);

  const c = await cart();
  assert.equal(c.freeDeliveryThresholdPaise, BASKET);
  assert.equal(c.freeDeliveryRemainingPaise, 0);
  assert.equal(c.qualifiesFreeDelivery, true);

  const q = await quote();
  assert.equal(q.deliveryFeePaise, 0);
  const placed = await place(q.totalPaise);
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(order.deliveryFeePaise, 0);
  assert.equal(order.totalPaise, q.totalPaise);
});

test("threshold set, basket one paisa short: the full fee is charged, and the cart says how far there is to go", async () => {
  await setThreshold(String(BASKET + 1));
  await addItem(USER, null, variantId, 3);

  const c = await cart();
  assert.equal(c.freeDeliveryThresholdPaise, BASKET + 1);
  assert.equal(c.freeDeliveryRemainingPaise, 1);
  assert.equal(c.qualifiesFreeDelivery, false);

  const q = await quote();
  assert.equal(q.deliveryFeePaise, FEE, "one paisa short still pays the whole fee");
  const placed = await place(q.totalPaise);
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(order.deliveryFeePaise, FEE);
});

test("threshold set, basket above it: delivery is free and the free and paid totals differ by exactly the fee", async () => {
  await addItem(USER, null, variantId, 3);
  const paid = await quote(); // no threshold yet
  assert.equal(paid.deliveryFeePaise, FEE);

  await setThreshold(String(BASKET - 1));
  const c = await cart();
  assert.equal(c.qualifiesFreeDelivery, true);
  assert.equal(c.freeDeliveryRemainingPaise, 0);
  const free = await quote();
  assert.equal(free.deliveryFeePaise, 0);
  assert.equal(paid.totalPaise - free.totalPaise, FEE, "the waiver is worth the fee and nothing else");
});

/* --------------------------------------------------- changed, and removed again */

test("the owner changes the figure, then removes it: each read follows the setting as it is now", async () => {
  await addItem(USER, null, variantId, 3);

  await setThreshold(String(BASKET));
  assert.equal((await cart()).qualifiesFreeDelivery, true);
  assert.equal((await quote()).deliveryFeePaise, 0);

  await setThreshold(String(BASKET + 2 * UNIT)); // raised above this basket
  const raised = await cart();
  assert.equal(raised.freeDeliveryThresholdPaise, BASKET + 2 * UNIT);
  assert.equal(raised.freeDeliveryRemainingPaise, 2 * UNIT);
  assert.equal(raised.qualifiesFreeDelivery, false);
  assert.equal((await quote()).deliveryFeePaise, FEE, "the old figure was still being applied");

  await setThreshold(null); // removed
  const gone = await cart();
  assert.deepEqual(
    [gone.freeDeliveryThresholdPaise, gone.freeDeliveryRemainingPaise, gone.qualifiesFreeDelivery],
    [0, 0, false]
  );
  assert.equal((await quote()).deliveryFeePaise, FEE);

  /* Cleared from the settings screen, which stores an empty string rather than
     deleting the row (`adminSaveSettings`). Same answer. */
  await setThreshold("");
  assert.equal((await cart()).qualifiesFreeDelivery, false);
  assert.equal((await quote()).deliveryFeePaise, FEE);
});

/* ------------------------------------------- the rule moved between quote and order */

test("quoted free, threshold removed before the press: refused with TOTAL_CHANGED, nothing written; the re-quote then places with the fee", async () => {
  await setThreshold(String(BASKET));
  await addItem(USER, null, variantId, 3);
  const shown = await quote();
  assert.equal(shown.deliveryFeePaise, 0);

  await setThreshold(null); // the owner withdraws the offer

  const before = { orders: await orders(), stock: await stock() };
  const key = randomUUID();
  await assert.rejects(place(shown.totalPaise, key), /^Error: TOTAL_CHANGED$/);
  assert.equal(await orders(), before.orders, "an order was placed at a total the customer was not shown");
  assert.equal(await stock(), before.stock, "stock was taken for a refused order");
  assert.equal((await cart()).count, 3, "the cart was not left alone");

  const fresh = await quote();
  assert.equal(fresh.totalPaise, shown.totalPaise + FEE);
  const placed = await place(fresh.totalPaise, key);
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(order.deliveryFeePaise, FEE);
  assert.equal(order.totalPaise, fresh.totalPaise);
});

test("quoted with the fee, threshold set before the press: also refused — a cheaper total is still not the one shown", async () => {
  await addItem(USER, null, variantId, 3);
  const shown = await quote();
  assert.equal(shown.deliveryFeePaise, FEE);

  await setThreshold(String(BASKET)); // the owner starts the offer

  const before = { orders: await orders(), stock: await stock() };
  const key = randomUUID();
  await assert.rejects(place(shown.totalPaise, key), /^Error: TOTAL_CHANGED$/);
  assert.equal(await orders(), before.orders, "no order");
  assert.equal(await stock(), before.stock, "no stock taken");

  const fresh = await quote();
  assert.equal(fresh.totalPaise, shown.totalPaise - FEE);
  const placed = await place(fresh.totalPaise, key);
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(order.deliveryFeePaise, 0);
  assert.equal(order.totalPaise, fresh.totalPaise);
});

/* ---------------------------------------------------------- malformed values */

test("a stored value that is not a positive whole number of paise is no offer, never a guess", async () => {
  await addItem(USER, null, variantId, 50); // large enough to clear any figure a bad parse might produce
  for (const bad of ["", "   ", "0", "-100", "-60000", "abc", "₹500", "12.5", "60000.00", "1e5", "NaN", "Infinity"]) {
    await setThreshold(bad);
    assert.equal(await readFreeDeliveryThresholdPaise(), null, `${JSON.stringify(bad)} was read as a threshold`);
    const c = await cart();
    assert.deepEqual(
      [c.freeDeliveryThresholdPaise, c.freeDeliveryRemainingPaise, c.qualifiesFreeDelivery],
      [0, 0, false],
      `${JSON.stringify(bad)} produced an offer in the cart`
    );
    assert.equal((await quote()).deliveryFeePaise, FEE, `${JSON.stringify(bad)} waived the delivery fee`);
  }
});
