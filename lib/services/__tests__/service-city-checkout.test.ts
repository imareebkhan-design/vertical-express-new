/**
 * City-wise service areas through the real checkout (15 Oct 2026).
 *
 * One decision — pincode included AND its city live — must hold at every step
 * a customer can reach: the quote, the express offer, and the final order
 * placement, which re-checks under a lock so a city switched off while
 * checkout is running cannot get a new order. Orders already placed stay
 * fulfilable when a city is later switched off. All data here is created and
 * deleted by this file (`ZZZSC…`).
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem, getCartSummary } from "../cart";
import { placeOrder, computeTotals } from "../checkout";
import { checkServiceability } from "../serviceability";
import { createCity, includePincodes, setCityLive, setPincodeIncluded } from "../admin/serviceability-write";
import { assignShipment, advanceShipment } from "../admin/shipments-write";
import { createDriver } from "../admin/roster-write";
import { approveTestProductsCreatedSince } from "../../../test-support/catalogue-fixtures";
const SUITE_START = new Date();

const TAG = `ZZZSC${Date.now() % 1_000_000}`;
const PIN_IN = "999961";
const PIN_EXCLUDED = "999962";
const PIN_OTHER_CITY = "999963";
const PIN_UNLISTED = "999964";
const USER = randomUUID();
const ACTOR = randomUUID();

let cityA = "";
let cityB = "";
let warehouseId = "";
let productId = "";
let variantId = "";
let driverId = "";
const addressIds: Record<string, string> = {};
const savedEnv: Record<string, string | undefined> = {};
let savedCod: Awaited<ReturnType<typeof db.setting.findUnique>>;

const terms = () => ({ warehouseId, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: true, area: null });
const place = (pin: string) =>
  placeOrder({ userId: USER, addressId: addressIds[pin], paymentMethod: "cod", idempotencyKey: randomUUID() });
const orders = () => db.order.count({ where: { userId: USER } });

before(async () => {
  savedCod = await db.setting.findUnique({ where: { key: "cod.enabled" } });
  await db.setting.upsert({ where: { key: "cod.enabled" }, create: { key: "cod.enabled", value: "true" }, update: { value: "true" } });
  savedEnv.PAYMENT_GATEWAY = process.env.PAYMENT_GATEWAY;
  process.env.PAYMENT_GATEWAY = "dummy";

  const brand = await db.brand.findFirst({ select: { id: true } });
  const category = await db.category.findFirst({ where: { isBulk: false }, select: { id: true } });
  if (!brand || !category) throw new Error("Seed must provide a brand and a non-bulk category.");
  await db.user.create({ data: { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` } });
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} Delhi QA`, city: "Delhi", pincode: "110054" } })).id;

  const a = await createCity({ name: `ZZZ City ${TAG} A`, state: "Delhi" }, ACTOR);
  const b = await createCity({ name: `ZZZ City ${TAG} B`, state: "Delhi" }, ACTOR);
  assert.ok(a.ok && b.ok);
  cityA = a.ok ? a.value.id : "";
  cityB = b.ok ? b.value.id : "";
  await includePincodes(cityA, [PIN_IN, PIN_EXCLUDED], terms(), ACTOR);
  await setPincodeIncluded(PIN_EXCLUDED, false, ACTOR);
  await includePincodes(cityB, [PIN_OTHER_CITY], terms(), ACTOR); // B stays off
  await setCityLive(cityA, true, ACTOR);

  for (const pin of [PIN_IN, PIN_EXCLUDED, PIN_OTHER_CITY, PIN_UNLISTED]) {
    addressIds[pin] = (await db.address.create({
      data: { userId: USER, name: "SC Buyer", phone: "9876543210", line1: "Plot 1", city: "Delhi", state: "Jammu & Kashmir", pincode: pin, isDefault: pin === PIN_IN },
    })).id;
  }
  productId = (await db.product.create({
    data: { status: "published", title: `${TAG} item`, slug: `${TAG.toLowerCase()}-item`, categoryId: category.id, brandId: brand.id },
  })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Unit", sku: `${TAG}-item`, pricePaise: 11800 } })).id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 100 } });
  await approveTestProductsCreatedSince(SUITE_START);
  const d = await createDriver({ name: `ZZZ SC ${TAG}`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, actor: { id: ACTOR, email: "zzz@demo.invalid" } });
  driverId = d.ok ? d.id : "";
});

beforeEach(async () => {
  await setCityLive(cityA, true, ACTOR);
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await addItem(USER, null, variantId, 1);
});

after(async () => {
  if (savedCod) await db.setting.upsert({ where: { key: savedCod.key }, create: savedCod, update: savedCod });
  else await db.setting.deleteMany({ where: { key: "cod.enabled" } });
  if (savedEnv.PAYMENT_GATEWAY === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedEnv.PAYMENT_GATEWAY;
  const where = { order: { userId: USER } };
  const sids = (await db.shipment.findMany({ where, select: { id: true } })).map((s) => s.id);
  const oids = (await db.order.findMany({ where: { userId: USER }, select: { id: true } })).map((o) => o.id);
  const pins = await db.serviceablePincode.findMany({ where: { cityId: { in: [cityA, cityB] } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [...sids, ...oids, ...pins.map((p) => p.id), cityA, cityB, driverId] } } });
  await db.shipmentLiveLocation.deleteMany({ where: { shipmentId: { in: sids } } });
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
  await db.serviceablePincode.deleteMany({ where: { cityId: { in: [cityA, cityB] } } });
  await db.serviceCity.deleteMany({ where: { id: { in: [cityA, cityB] } } });
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.delete({ where: { id: variantId } });
  await db.product.delete({ where: { id: productId } });
  await db.driver.deleteMany({ where: { id: driverId } });
  await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.delete({ where: { id: USER } });
});

test("live city + included pincode: quoted, placed, from the city's warehouse, IGST for Delhi", async () => {
  const totals = await computeTotals(await getCartSummary(USER, null), PIN_IN, "Jammu & Kashmir", null, USER);
  assert.equal(totals.serviceable, true);
  assert.equal(totals.etaMinutes, 0, "no ETA promised when none is configured");
  assert.equal(totals.deliveryFeePaise, 0);
  /* The address says J&K (the form's default); the delivery pincode is in
     Delhi, so supply is inter-state: IGST, no CGST/SGST. */
  assert.equal(totals.placeOfSupplyState, "Delhi");
  assert.ok(totals.gst.igstPaise > 0);
  assert.equal(totals.gst.cgstPaise + totals.gst.sgstPaise, 0);

  const before = (await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand;
  const placed = await place(PIN_IN);
  const order = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo }, include: { items: true } });
  assert.equal(order.warehouseId, warehouseId, "stock reserved at the pincode's warehouse");
  assert.equal((order.items[0].cgstPaise ?? 0) + (order.items[0].sgstPaise ?? 0), 0);
  assert.ok((order.items[0].igstPaise ?? 0) > 0, "the placed order carries IGST");
  assert.equal((await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand, before - 1);
});

test("city switched off: refused even though the pincode itself is included", async () => {
  await setCityLive(cityA, false, ACTOR);
  assert.equal((await checkServiceability(PIN_IN)).serviceable, false);
  const cart = await getCartSummary(USER, null);
  const t = await computeTotals(cart, PIN_IN, null, null, USER);
  assert.equal(t.serviceable, false);
  assert.equal(t.express.available, false, "no express offer either");
  const n = await orders();
  await assert.rejects(place(PIN_IN), /PINCODE_UNSERVICEABLE/);
  assert.equal(await orders(), n);
});

test("excluded pincode refused, and an include range over it leaves it excluded", async () => {
  const r = await includePincodes(cityA, [PIN_IN, PIN_EXCLUDED], terms(), ACTOR);
  assert.ok(r.ok && r.value.skippedExcluded.includes(PIN_EXCLUDED));
  assert.equal((await checkServiceability(PIN_EXCLUDED)).serviceable, false);
  await assert.rejects(place(PIN_EXCLUDED), /PINCODE_UNSERVICEABLE/);
});

test("unlisted pincode refused; a pincode owned by another (off) city is not accepted via this one", async () => {
  await assert.rejects(place(PIN_UNLISTED), /PINCODE_UNSERVICEABLE/);
  await assert.rejects(place(PIN_OTHER_CITY), /PINCODE_UNSERVICEABLE/);
  const steal = await includePincodes(cityA, [PIN_OTHER_CITY], terms(), ACTOR);
  assert.equal(steal.ok, false, "a live city cannot absorb another city's pincode");
  assert.equal((await checkServiceability(PIN_OTHER_CITY)).serviceable, false);
});

test("an order already placed stays fulfilable after its city is switched off", async () => {
  const placed = await place(PIN_IN);
  await setCityLive(cityA, false, ACTOR);
  const ship = await db.shipment.findFirstOrThrow({ where: { order: { orderNo: placed.orderNo } } });
  const actor = { id: ACTOR, email: "zzz@demo.invalid" };
  assert.equal((await advanceShipment({ shipmentId: ship.id, to: "packed", actor })).ok, true);
  assert.equal((await assignShipment({ shipmentId: ship.id, driverId, actor })).ok, true);
  assert.equal((await advanceShipment({ shipmentId: ship.id, to: "out_for_delivery", actor })).ok, true);
  assert.equal((await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } })).status, "out_for_delivery");
});

test("checkout racing a city switch-off: the placement waits for it and refuses — no order, no stock taken", async () => {
  const n = await orders();
  const stockBefore = (await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  /* The switch-off is in flight (row updated, not committed) when checkout
     starts: the quote still sees the city live, the placement's lock waits. */
  const switchOff = db.$transaction(async (tx) => {
    await tx.serviceCity.update({ where: { id: cityA }, data: { isLive: false } });
    await held;
  }, { timeout: 10_000 });
  await new Promise((r) => setTimeout(r, 100));
  const placing = place(PIN_IN);
  await new Promise((r) => setTimeout(r, 400));
  release();
  await switchOff;
  await assert.rejects(placing, /PINCODE_UNSERVICEABLE/);
  assert.equal(await orders(), n, "no order was created");
  assert.equal((await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand, stockBefore);
});

/* Staging, 17 Oct (VE-2026-MVC648PX1424): the quote for a served Delhi address
   showed ₹199 with "Place order" enabled while the Delhi warehouse held none of
   the item. Placement then refused (OUT_OF_STOCK) and the customer, hurried,
   paid for a different, pinless address. The quote must say first. */
test("the quote names lines the serving warehouse cannot supply; in stock it names none", async () => {
  const cart = await getCartSummary(USER, null);
  const inStock = await computeTotals(cart, PIN_IN, null, null, USER);
  assert.deepEqual(inStock.unavailableLines, []);

  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 0 } });
  try {
    const short = await computeTotals(cart, PIN_IN, null, null, USER);
    assert.equal(short.serviceable, true, "still a served pincode");
    assert.deepEqual(short.unavailableLines, [`${TAG} item`]);
    await assert.rejects(place(PIN_IN), /OUT_OF_STOCK/, "placement agrees with the quote");
  } finally {
    await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 100 } });
  }
  const unserved = await computeTotals(cart, PIN_UNLISTED, null, null, USER);
  assert.deepEqual(unserved.unavailableLines, [], "an unserved pincode is reported as unserviceable, not as stock");
});
