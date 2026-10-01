/**
 * E7 — express delivery, end to end through a real placement.
 *
 * `express-delivery.test.ts` covers the offer (`resolveExpressOption`) and the
 * quote (`computeTotals`). This covers what the customer is charged and what is
 * written: the order, its payment amount and its shipments, for express-only,
 * truck-only and mixed baskets, eligible and ineligible pincodes, express switched
 * off, and requests that ask for express where it is not on offer.
 *
 * TEST-ONLY VALUES. The express fee below (₹77), the standard fee (₹49) and the
 * pincodes are fixtures on the local test database. The owner has set no express
 * fee, SLA or area (docs/OWNER_INPUT_REQUIRED.md 6.3, 6.4, 6.9); nothing here is a
 * price or a promise.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { addItem } from "../cart";
import { getCartSummary } from "../cart";
import { computeTotals, placeOrder } from "../checkout";
import { resolveExpressOption } from "../express-delivery";
import { SETTING_KEYS } from "../settings";
import { getDispatchBoard, getShipmentsForOrder, getShipmentsOnTheRoad } from "../shipments";
import { adminGetOrder } from "../admin/manage";

const TAG = randomUUID().slice(0, 8);
const USER = randomUUID();
const PIN_EXPRESS = "999971"; // served, and the eligible products name it
const PIN_PLAIN = "999972"; // served, named by no product
const PIN_NONE = "999973"; // not served at all
const EXPRESS_FEE = 7700; // test-only
const STANDARD_FEE = 4900; // test-only

let warehouseId: string;
const addressIds: Record<string, string> = {};
const products: Record<string, { productId: string; variantId: string }> = {};
let savedFee: string | null = null;
let savedGateway: string | undefined;
let couponId: string;

async function makeProduct(key: string, opts: { bulk: boolean; eligible: boolean; pricePaise: number }) {
  const category = await db.category.findFirstOrThrow({ where: { isBulk: opts.bulk }, select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const product = await db.product.create({
    data: {
      slug: `zzz-e7-${key}-${TAG}`,
      title: `ZZZ E7 ${key}`,
      brandId: brand.id,
      categoryId: category.id,
      status: "published",
      expressEligible: opts.eligible,
      expressPincodes: opts.eligible ? { create: [{ pincode: PIN_EXPRESS }] } : undefined,
      variants: { create: [{ sku: `ZZZ-E7-${key}-${TAG}`.toUpperCase(), name: "Default", pricePaise: opts.pricePaise, isDefault: true }] },
    },
    include: { variants: true },
  });
  await db.inventory.create({ data: { variantId: product.variants[0].id, warehouseId, qtyOnHand: 1000 } });
  products[key] = { productId: product.id, variantId: product.variants[0].id };
}

async function setFee(paise: number | null) {
  if (paise === null) await db.setting.deleteMany({ where: { key: SETTING_KEYS.expressFeePaise } });
  else
    await db.setting.upsert({
      where: { key: SETTING_KEYS.expressFeePaise },
      create: { key: SETTING_KEYS.expressFeePaise, value: String(paise) },
      update: { value: String(paise) },
    });
}

before(async () => {
  savedGateway = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";
  savedFee = (await db.setting.findUnique({ where: { key: SETTING_KEYS.expressFeePaise } }))?.value ?? null;

  await db.user.create({ data: { id: USER } });
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ E7 ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  for (const pincode of [PIN_EXPRESS, PIN_PLAIN]) {
    await db.serviceablePincode.create({ data: { pincode, warehouseId, deliveryFeePaise: STANDARD_FEE, etaMinutes: 120, isActive: true } });
  }
  for (const pincode of [PIN_EXPRESS, PIN_PLAIN, PIN_NONE]) {
    addressIds[pincode] = (
      await db.address.create({
        /* The express-listed site is the default, so the cart resolves stock from the fixture warehouse. */
        data: { userId: USER, name: "E7 Fixture", phone: "9000000007", line1: "Yard 7", city: "Srinagar", state: "Jammu & Kashmir", pincode, isDefault: pincode === PIN_EXPRESS },
      })
    ).id;
  }
  await makeProduct("switch", { bulk: false, eligible: true, pricePaise: 12000 }); // bike-class, express-listed
  await makeProduct("tape", { bulk: false, eligible: false, pricePaise: 8000 }); // bike-class, not express
  await makeProduct("cement", { bulk: true, eligible: false, pricePaise: 26000 }); // truck
  await makeProduct("sheet", { bulk: true, eligible: true, pricePaise: 26000 }); // truck, wrongly flagged eligible
  couponId = (await db.coupon.create({ data: { code: `ZZZE7FREE${TAG}`.toUpperCase(), type: "free_delivery", value: 0, perUserLimit: 100 } })).id;
  await setFee(EXPRESS_FEE);
});

after(async () => {
  await setFee(savedFee === null ? null : Number(savedFee));
  if (savedGateway === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedGateway;
  const orders = { order: { userId: USER } };
  await db.shipmentItem.deleteMany({ where: { shipment: orders } });
  await db.shipment.deleteMany({ where: orders });
  await db.couponRedemption.deleteMany({ where: { couponId } });
  await db.orderItem.deleteMany({ where: orders });
  await db.payment.deleteMany({ where: orders });
  await db.orderStatusEvent.deleteMany({ where: orders });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.coupon.deleteMany({ where: { id: couponId } });
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await db.cart.deleteMany({ where: { userId: USER } });
  await db.address.deleteMany({ where: { userId: USER } });
  await db.serviceablePincode.deleteMany({ where: { pincode: { in: [PIN_EXPRESS, PIN_PLAIN] } } });
  for (const p of Object.values(products)) {
    await db.inventory.deleteMany({ where: { variantId: p.variantId } });
    await db.productVariant.deleteMany({ where: { id: p.variantId } });
    await db.product.deleteMany({ where: { id: p.productId } });
  }
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: USER } });
});

async function basket(...keys: string[]) {
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  for (const k of keys) await addItem(USER, null, products[k].variantId, 1);
}

async function quote(pincode: string, wantsExpress: boolean, couponCode?: string) {
  return computeTotals(await getCartSummary(USER, null), pincode, "Jammu & Kashmir", couponCode, USER, wantsExpress);
}

async function place(pincode: string, wantsExpress: boolean, couponCode?: string) {
  const res = await placeOrder({ userId: USER, addressId: addressIds[pincode], paymentMethod: "dummy", idempotencyKey: randomUUID(), wantsExpress, couponCode });
  return db.order.findUniqueOrThrow({
    where: { orderNo: res.orderNo },
    include: {
      payments: true,
      shipments: { orderBy: { sequence: "asc" }, include: { items: { include: { orderItem: { select: { variantId: true } } } } } },
    },
  });
}

const variantsOf = (s: { items: { orderItem: { variantId: string } }[] }) => s.items.map((i) => i.orderItem.variantId).sort();
const v = (...keys: string[]) => keys.map((k) => products[k].variantId).sort();

test("saved express choice reaches customer, admin and dispatch reads separately from vehicle class", async () => {
  await basket("switch", "tape", "cement");
  const order = await place(PIN_EXPRESS, true);
  const customer = await getShipmentsForOrder(USER, order.orderNo);
  assert.deepEqual(customer?.shipments.map(s => [s.sequence, s.expressRun]), [[1, true], [2, false], [3, false]]);
  assert.equal(await getShipmentsForOrder(randomUUID(), order.orderNo), null, "ownership remains enforced");
  const admin = await adminGetOrder(order.orderNo);
  assert.equal(admin?.expressFeePaise, EXPRESS_FEE);
  assert.deepEqual(admin?.shipments.map(s => s.expressRun), [true, false, false]);
  const board = await getDispatchBoard();
  const rows = [...board.express, ...board.scheduled].filter(s => s.orderNo === order.orderNo);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(s => s.expressRun).length, 1, "the standard bike is not selected express");
  const expressId = order.shipments.find(s => s.expressRun)!.id;
  await db.shipment.update({ where: { id: expressId }, data: { status: "out_for_delivery", dispatchedAt: new Date() } });
  const road = (await getShipmentsOnTheRoad()).find(s => s.id === expressId);
  assert.equal(road?.expressRun, true, "choice survives dispatch");
});

test("express-only basket, express chosen: charged the quote, gateway amount = total, and the order and its shipment record the express run", async () => {
  await basket("switch");
  const q = await quote(PIN_EXPRESS, true);
  assert.equal(q.expressChosen, true);
  assert.equal(q.deliveryFeePaise, STANDARD_FEE + EXPRESS_FEE);

  const order = await place(PIN_EXPRESS, true);
  assert.equal(order.totalPaise, q.totalPaise, "charged exactly what was quoted");
  assert.equal(order.deliveryFeePaise, STANDARD_FEE + EXPRESS_FEE);
  assert.equal(order.payments[0].amountPaise, order.totalPaise, "the gateway is asked for the order total");
  assert.equal((order as Record<string, unknown>).expressFeePaise, EXPRESS_FEE, "the order records that express was chosen, and at what charge");
  assert.equal(order.shipments.length, 1);
  assert.equal(order.shipments[0].speedClass, "express");
  assert.equal((order.shipments[0] as Record<string, unknown>).expressRun, true, "the shipment is marked for the express run");
});

test("same basket, express not chosen: standard price, and nothing records an express run", async () => {
  await basket("switch");
  const q = await quote(PIN_EXPRESS, false);
  const order = await place(PIN_EXPRESS, false);
  assert.equal(order.totalPaise, q.totalPaise);
  assert.equal(order.deliveryFeePaise, STANDARD_FEE);
  assert.equal((order as Record<string, unknown>).expressFeePaise, null);
  assert.equal((order.shipments[0] as Record<string, unknown>).expressRun, false);
});

test("truck-only basket: express is not offered, and asking for it anyway is standard with a truck shipment", async () => {
  await basket("cement");
  const q = await quote(PIN_EXPRESS, true);
  assert.equal(q.express.available, false);
  assert.equal(q.express.reason, "no_eligible_items");
  assert.equal(q.expressChosen, false);

  const order = await place(PIN_EXPRESS, true);
  assert.equal(order.deliveryFeePaise, STANDARD_FEE, "no express charge");
  assert.equal((order as Record<string, unknown>).expressFeePaise, null);
  assert.deepEqual(order.shipments.map((s) => s.speedClass), ["scheduled"]);
  assert.equal((order.shipments[0] as Record<string, unknown>).expressRun, false);
});

test("a truck item flagged express-eligible never inherits the express run: not offered, not charged, not promised", async () => {
  /* Listing lets an operator tick express on any product; the truck still carries it. */
  const offer = await resolveExpressOption([{ variantId: products.sheet.variantId, productId: products.sheet.productId, categoryIsBulk: true, deliverySpeed: null }], PIN_EXPRESS);
  assert.equal(offer.available, false, "a truck item is not offered the express run");
  assert.deepEqual(offer.eligibleVariantIds, []);

  await basket("sheet");
  const order = await place(PIN_EXPRESS, true);
  assert.equal(order.deliveryFeePaise, STANDARD_FEE, "not charged for express");
  assert.equal((order as Record<string, unknown>).expressFeePaise, null);
  assert.deepEqual(order.shipments.map((s) => [s.speedClass, (s as Record<string, unknown>).expressRun]), [["scheduled", false]]);
});

test("mixed basket, express chosen: only the eligible item goes on the express run; the rest follow as they would have", async () => {
  await basket("switch", "tape", "cement");
  const q = await quote(PIN_EXPRESS, true);
  assert.equal(q.express.available, true);
  assert.equal(q.express.reason, "mixed_cart");
  assert.deepEqual([...q.express.eligibleVariantIds].sort(), v("switch"));

  const order = await place(PIN_EXPRESS, true);
  assert.equal(order.totalPaise, q.totalPaise);
  assert.equal((order as Record<string, unknown>).expressFeePaise, EXPRESS_FEE);
  const shape = order.shipments.map((s) => ({ speed: s.speedClass, run: (s as Record<string, unknown>).expressRun, lines: variantsOf(s) }));
  assert.deepEqual(shape, [
    { speed: "express", run: true, lines: v("switch") },
    { speed: "express", run: false, lines: v("tape") },
    { speed: "scheduled", run: false, lines: v("cement") },
  ]);
});

test("mixed basket, standard chosen: the split is exactly what it was before express existed", async () => {
  await basket("switch", "tape", "cement");
  const order = await place(PIN_EXPRESS, false);
  const shape = order.shipments.map((s) => ({ speed: s.speedClass, run: (s as Record<string, unknown>).expressRun, lines: variantsOf(s) }));
  assert.deepEqual(shape, [
    { speed: "express", run: false, lines: v("switch", "tape") },
    { speed: "scheduled", run: false, lines: v("cement") },
  ]);
  assert.equal(order.deliveryFeePaise, STANDARD_FEE);
});

test("a served pincode no product names: express not offered; a direct request for it is standard", async () => {
  await basket("switch");
  const q = await quote(PIN_PLAIN, true);
  assert.equal(q.express.available, false);
  const order = await place(PIN_PLAIN, true);
  assert.equal(order.deliveryFeePaise, STANDARD_FEE);
  assert.equal((order as Record<string, unknown>).expressFeePaise, null);
});

test("an unserviceable pincode is refused at placement, express or not, and writes nothing", async () => {
  await basket("switch");
  const before = await db.order.count({ where: { userId: USER } });
  await assert.rejects(place(PIN_NONE, true), /PINCODE_UNSERVICEABLE/);
  assert.equal(await db.order.count({ where: { userId: USER } }), before);
});

test("express switched off (no fee set): the quote says so, and a direct request for express is placed standard", async () => {
  await setFee(null);
  try {
    await basket("switch");
    const q = await quote(PIN_EXPRESS, true);
    assert.equal(q.express.available, false);
    assert.equal(q.express.reason, "no_price");
    const order = await place(PIN_EXPRESS, true);
    assert.equal(order.deliveryFeePaise, STANDARD_FEE);
    assert.equal((order as Record<string, unknown>).expressFeePaise, null);
    assert.equal((order.shipments[0] as Record<string, unknown>).expressRun, false);
  } finally {
    await setFee(EXPRESS_FEE);
  }
});

test("idempotent retry with express: one order, the same total", async () => {
  await basket("switch");
  const key = randomUUID();
  const a = await placeOrder({ userId: USER, addressId: addressIds[PIN_EXPRESS], paymentMethod: "dummy", idempotencyKey: key, wantsExpress: true });
  const b = await placeOrder({ userId: USER, addressId: addressIds[PIN_EXPRESS], paymentMethod: "dummy", idempotencyKey: key, wantsExpress: true });
  assert.equal(a.orderNo, b.orderNo);
  assert.equal(await db.order.count({ where: { idempotencyKey: key } }), 1);
});

test("CURRENT BEHAVIOUR — owner decision pending: a free-delivery coupon waives the express charge as well as the standard fee", async () => {
  /* Recorded, not endorsed. Whether a free-delivery coupon should also cover the
     express surcharge is the owner's call (readiness matrix, E7). The express run
     is still recorded, because the customer chose it and dispatch must run it. */
  await basket("switch");
  const code = `ZZZE7FREE${TAG}`.toUpperCase();
  const q = await quote(PIN_EXPRESS, true, code);
  assert.equal(q.expressChosen, true);
  assert.equal(q.deliveryFeePaise, 0);
  assert.equal(q.couponDeliveryWaivedPaise, STANDARD_FEE + EXPRESS_FEE);
  const order = await place(PIN_EXPRESS, true, code);
  assert.equal(order.totalPaise, q.totalPaise);
  assert.equal(order.deliveryFeePaise, 0);
  assert.equal((order as Record<string, unknown>).expressFeePaise, EXPRESS_FEE, "the express choice is still on record");
  assert.equal((order.shipments[0] as Record<string, unknown>).expressRun, true);
});
