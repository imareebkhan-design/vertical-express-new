/**
 * ISS-068 — changing a variant's price from the console.
 *
 * Through the real service against the local test database. What matters is
 * what the change does NOT do as much as what it does: a placed order keeps
 * its price, a checkout showing the old total cannot be placed at the new one,
 * a save from a stale screen does not overwrite a newer one, and a price never
 * changes without its audit row. All data is created and deleted by this file
 * (`ZZZPRICE…`).
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem, getCartSummary } from "@/lib/services/cart";
import { placeOrder, computeTotals } from "@/lib/services/checkout";
import { setVariantPrice, priceProblem, MAX_STORED_PAISE } from "@/lib/services/admin/variant-pricing";

const PINCODE = "999968";
const STATE = "Jammu & Kashmir";
const USER = randomUUID();
const ADMIN = { id: randomUUID() };
const TAG = `ZZZPRICE${Date.now() % 1_000_000}`;

let warehouseId: string;
let addressId: string;
let productId: string;
let variantId: string;
let savedCod: Awaited<ReturnType<typeof db.setting.findUnique>>;
let savedGateway: string | undefined;

const variant = () =>
  db.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { pricePaise: true, compareAtPaise: true } });
const audits = () => db.auditLog.findMany({ where: { entityId: variantId }, orderBy: { createdAt: "asc" } });
const quote = async () => (await computeTotals(await getCartSummary(USER, null), PINCODE, STATE, null, USER)).totalPaise;
const change = (pricePaise: number, compareAtPaise: number | null, expected: { pricePaise: number; compareAtPaise: number | null }) => ({
  variantId,
  pricePaise,
  compareAtPaise,
  expected,
});

before(async () => {
  savedCod = await db.setting.findUnique({ where: { key: "cod.enabled" } });
  await db.setting.upsert({ where: { key: "cod.enabled" }, create: { key: "cod.enabled", value: "true" }, update: { value: "true" } });
  savedGateway = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";
  const brand = await db.brand.findFirst({ select: { id: true } });
  const category = await db.category.findFirst({ where: { isBulk: false }, select: { id: true } });
  if (!brand || !category) throw new Error("Seed must provide a brand and a non-bulk category.");
  await db.user.create({ data: { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` } });
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} Warehouse`, city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({ data: { pincode: PINCODE, warehouseId, isActive: true, codAllowed: true, deliveryFeePaise: 0 } });
  addressId = (await db.address.create({
    data: { userId: USER, name: "Price Buyer", phone: "9876543210", line1: "Plot 68", city: "Srinagar", state: STATE, pincode: PINCODE, isDefault: true },
  })).id;
  productId = (await db.product.create({
    data: { title: `${TAG} item`, slug: `${TAG.toLowerCase()}-item`, categoryId: category.id, brandId: brand.id },
  })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Unit", sku: `${TAG}-item`, pricePaise: 20000, compareAtPaise: 25000 } })).id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 100 } });
});

beforeEach(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await db.auditLog.deleteMany({ where: { entityId: variantId } });
  await db.productVariant.update({ where: { id: variantId }, data: { pricePaise: 20000, compareAtPaise: 25000 } });
});

after(async () => {
  if (savedCod) await db.setting.upsert({ where: { key: savedCod.key }, create: savedCod, update: savedCod });
  else await db.setting.deleteMany({ where: { key: "cod.enabled" } });
  if (savedGateway === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedGateway;
  const where = { order: { userId: USER } };
  await db.shipmentItem.deleteMany({ where: { shipment: where } });
  await db.shipment.deleteMany({ where });
  await db.orderItem.deleteMany({ where });
  await db.payment.deleteMany({ where });
  await db.orderStatusEvent.deleteMany({ where });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: USER }, { entityId: variantId }] } });
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

test("the listing form's rules, plus the column's limit", () => {
  assert.equal(priceProblem(38500, null), null);
  assert.equal(priceProblem(38500, 44000), null);
  assert.match(priceProblem(0, null)!, /more than zero/);
  assert.match(priceProblem(-100, null)!, /more than zero/);
  assert.match(priceProblem(385.5, null)!, /not a rupee amount/);
  assert.match(priceProblem(38500, 38500)!, /MRP must be above/);
  assert.match(priceProblem(38500, 30000)!, /MRP must be above/);
  assert.match(priceProblem(MAX_STORED_PAISE + 1, null)!, /too large/);
  assert.equal(priceProblem(MAX_STORED_PAISE - 1, MAX_STORED_PAISE), null);
});

test("a change writes the new price and one audit row with who, before and after", async () => {
  const res = await setVariantPrice(change(21500, null, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN);
  assert.deepEqual(res, { ok: true, changed: true, productSlug: `${TAG.toLowerCase()}-item` });
  assert.deepEqual(await variant(), { pricePaise: 21500, compareAtPaise: null });
  const rows = await audits();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "variant.price_changed");
  assert.equal(rows[0].actorType, "admin");
  assert.equal(rows[0].actorId, ADMIN.id);
  assert.deepEqual(rows[0].before, { pricePaise: 20000, compareAtPaise: 25000 });
  assert.deepEqual(rows[0].after, { pricePaise: 21500, compareAtPaise: null });
});

test("saving the price that is already stored changes nothing and records nothing", async () => {
  const res = await setVariantPrice(change(20000, 25000, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN);
  assert.deepEqual(res, { ok: true, changed: false, productSlug: `${TAG.toLowerCase()}-item` });
  assert.equal((await audits()).length, 0);
});

test("an invalid price is refused before anything is read or written", async () => {
  const res = await setVariantPrice(change(20000, 19000, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN);
  assert.equal(res.ok, false);
  assert.ok(!res.ok && res.reason === "invalid");
  assert.deepEqual(await variant(), { pricePaise: 20000, compareAtPaise: 25000 });
  assert.equal((await audits()).length, 0);
});

test("a save from a stale screen is refused: the newer price stays, no audit row", async () => {
  await setVariantPrice(change(22000, 25000, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN); // first operator
  const res = await setVariantPrice(change(19000, 25000, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN); // second, still showing ₹200
  assert.deepEqual(res, { ok: false, reason: "stale" });
  assert.deepEqual(await variant(), { pricePaise: 22000, compareAtPaise: 25000 });
  assert.equal((await audits()).length, 1, "only the first change is recorded");
});

test("two saves from the same screen at the same moment: exactly one lands", async () => {
  const shown = { pricePaise: 20000, compareAtPaise: 25000 };
  const results = await Promise.all([
    setVariantPrice(change(21000, 25000, shown), ADMIN),
    setVariantPrice(change(23000, 25000, shown), ADMIN),
  ]);
  const landed = results.filter((r) => r.ok && r.changed);
  assert.equal(landed.length, 1, JSON.stringify(results));
  assert.equal(results.filter((r) => !r.ok && r.reason === "stale").length, 1);
  assert.equal((await audits()).length, 1);
  assert.ok([21000, 23000].includes((await variant()).pricePaise));
});

test("if the audit row cannot be written, the price does not change", async () => {
  const failingAudit = async () => {
    throw new Error("audit store unavailable");
  };
  await assert.rejects(
    setVariantPrice(change(21500, null, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN, failingAudit),
    /audit store unavailable/
  );
  assert.deepEqual(await variant(), { pricePaise: 20000, compareAtPaise: 25000 });
});

test("an unknown variant is reported, not created", async () => {
  const res = await setVariantPrice({ ...change(21500, null, { pricePaise: 1, compareAtPaise: null }), variantId: randomUUID() }, ADMIN);
  assert.deepEqual(res, { ok: false, reason: "not_found" });
});

test("a placed order keeps the price it was placed at", async () => {
  await addItem(USER, null, variantId, 2);
  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: randomUUID(), expectedTotalPaise: await quote() });
  await setVariantPrice(change(30000, null, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN);
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo }, include: { items: true } });
  assert.equal(order.totalPaise, 40000);
  assert.equal(order.items[0].unitPricePaise, 20000);
});

test("an open cart shows the new price, and a checkout still showing the old total is refused", async () => {
  await addItem(USER, null, variantId, 1);
  const shown = await quote();
  assert.equal(shown, 20000);
  await setVariantPrice(change(21500, null, { pricePaise: 20000, compareAtPaise: 25000 }), ADMIN);
  assert.equal((await getCartSummary(USER, null)).subtotalPaise, 21500, "the cart resolves the price on read");
  const before = await db.order.count({ where: { userId: USER } });
  await assert.rejects(
    placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: randomUUID(), expectedTotalPaise: shown }),
    /^Error: TOTAL_CHANGED$/
  );
  assert.equal(await db.order.count({ where: { userId: USER } }), before, "nothing placed at an unseen price");
  const fresh = await quote();
  assert.equal(fresh, 21500);
  const placed = await placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: randomUUID(), expectedTotalPaise: fresh });
  assert.equal((await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } })).totalPaise, 21500);
});
