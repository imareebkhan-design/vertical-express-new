/**
 * E8 — a cart changed in another tab after the page's quote is not placed at a
 * total the customer never saw.
 *
 * Through the real `placeOrder` against the local test database. The cart is
 * shared by every tab and window of one account; each test changes it "from
 * elsewhere" between the quote and the press, exactly as a second tab would.
 * All data here is created and deleted by this file (`ZZZE8…`).
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem, getCartSummary } from "../cart";
import { placeOrder, computeTotals } from "../checkout";
import { classifyPlaceOrderError, isTotalChangedError } from "@/lib/checkout-errors";

const PINCODE = "999918";
const STATE = "Jammu & Kashmir";
const USER = randomUUID();
const TAG = `ZZZE8${Date.now() % 1_000_000}`;

let warehouseId: string;
let addressId: string;
let productId: string;
let variantId: string;
const savedEnv: Record<string, string | undefined> = {};

const quote = async () => (await computeTotals(await getCartSummary(USER, null), PINCODE, STATE, null, USER)).totalPaise;
const stock = async () => (await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand;
const orders = () => db.order.count({ where: { userId: USER } });

before(async () => {
  savedEnv.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";
  const brand = await db.brand.findFirst({ select: { id: true } });
  const category = await db.category.findFirst({ where: { isBulk: false }, select: { id: true } });
  if (!brand || !category) throw new Error("Seed must provide a brand and a non-bulk category.");
  await db.user.create({ data: { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` } });
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} Warehouse`, city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({
    data: { pincode: PINCODE, warehouseId, isActive: true, codAllowed: true, deliveryFeePaise: 4900 },
  });
  addressId = (await db.address.create({
    data: { userId: USER, name: "E8 Buyer", phone: "9876543210", line1: "Plot 8", city: "Srinagar", state: STATE, pincode: PINCODE, isDefault: true },
  })).id;
  productId = (await db.product.create({
    data: { title: `${TAG} item`, slug: `${TAG.toLowerCase()}-item`, categoryId: category.id, brandId: brand.id },
  })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Unit", sku: `${TAG}-item`, pricePaise: 20000 } })).id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 100 } });
});

beforeEach(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
});

after(async () => {
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

test("the total on screen is still the server's: the order is placed at it", async () => {
  await addItem(USER, null, variantId, 1);
  const shown = await quote();
  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: randomUUID(), expectedTotalPaise: shown });
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(order.totalPaise, shown);
});

test("another tab added to the cart after the quote: refused, nothing placed, stock and cart untouched; the new total then places", async () => {
  await addItem(USER, null, variantId, 1);
  const shown = await quote();
  await addItem(USER, null, variantId, 2); // the other tab
  const before = { orders: await orders(), stock: await stock() };
  const key = randomUUID();

  await assert.rejects(
    placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: key, expectedTotalPaise: shown }),
    /^Error: TOTAL_CHANGED$/
  );
  assert.equal(await orders(), before.orders, "no order");
  assert.equal(await stock(), before.stock, "no stock taken");
  assert.equal((await getCartSummary(USER, null)).count, 3, "the cart is as the other tab left it");

  /* The page re-reads and re-quotes; the customer presses again with the same key. */
  const fresh = await quote();
  assert.notEqual(fresh, shown);
  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: key, expectedTotalPaise: fresh });
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(order.totalPaise, fresh);
});

test("a replay of an order already placed is returned as it was, even though the cart has since emptied", async () => {
  await addItem(USER, null, variantId, 1);
  const shown = await quote();
  const key = randomUUID();
  const first = await placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: key, expectedTotalPaise: shown });
  const count = await orders();
  const again = await placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: key, expectedTotalPaise: shown });
  assert.equal(again.orderNo, first.orderNo);
  assert.equal(await orders(), count, "no second order");
});

test("a caller that sends no expected total (the native app today) keeps its behaviour", async () => {
  await addItem(USER, null, variantId, 1);
  await addItem(USER, null, variantId, 1);
  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: randomUUID() });
  assert.ok(placed.orderNo);
});

test("the refusal reaches the screen as a CONFLICT it can recognise, with a message that nothing was placed", () => {
  const res = classifyPlaceOrderError(new Error("TOTAL_CHANGED"));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "CONFLICT");
  assert.ok(isTotalChangedError(res.error));
  assert.match(res.error.message, /nothing has been placed/);
  const other = classifyPlaceOrderError(new Error("CART_EMPTY"));
  assert.ok(!other.ok && !isTotalChangedError(other.error), "other refusals are not mistaken for it");
});
