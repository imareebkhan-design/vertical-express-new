import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { QA_FIXTURE_SKU } from "@/lib/catalog/qa-fixture-ids";
import { checkServiceability } from "@/lib/services/serviceability";
import { addItem } from "@/lib/services/cart";
import {
  removeDelhiTrial, setupDelhiTrial, TRIAL_CITY, TRIAL_PINCODE, TRIAL_WAREHOUSE,
} from "@/lib/services/admin/qa-delhi-trial";

/**
 * The staging Delhi trial: its own warehouse with QA TEST stock only, no
 * business values (free, no ETA, no cash), off until --live, removable without
 * deleting anything. A real product has no stock at the trial warehouse, so it
 * cannot be bought at 110054.
 */
const USER = randomUUID();
let createdQaProduct: string | null = null;
let realVariant = "";

before(async () => {
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const category = await db.category.findFirstOrThrow({ where: { isBulk: false }, select: { id: true } });
  if (!(await db.productVariant.findUnique({ where: { sku: QA_FIXTURE_SKU } }))) {
    const p = await db.product.create({
      data: { status: "draft", title: "ZZZ QA stand-in", slug: `zzz-qa-standin-${randomUUID().slice(0, 6)}`, categoryId: category.id, brandId: brand.id },
    });
    await db.productVariant.create({ data: { productId: p.id, name: "Unit", sku: QA_FIXTURE_SKU, pricePaise: 100 } });
    createdQaProduct = p.id;
  }
  /* A seeded, sellable real product (stocked in Srinagar, not in Delhi). */
  realVariant = (await db.inventory.findFirstOrThrow({
    where: { qtyOnHand: { gt: 0 }, variant: { isActive: true, product: { status: "published" } } },
    select: { variantId: true },
  })).variantId;
  await db.user.create({ data: { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` } });
  await db.address.create({
    data: { userId: USER, name: "Trial", phone: "9876543210", line1: "1 Test Lane", city: "Delhi", state: "Delhi", pincode: TRIAL_PINCODE, isDefault: true },
  });
});

after(async () => {
  const city = await db.serviceCity.findUnique({ where: { name: TRIAL_CITY } });
  const wh = await db.warehouse.findFirst({ where: { name: TRIAL_WAREHOUSE } });
  const pin = await db.serviceablePincode.findUnique({ where: { pincode: TRIAL_PINCODE } });
  await db.auditLog.deleteMany({ where: { entityId: { in: [city?.id, pin?.id].filter(Boolean) as string[] } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: TRIAL_PINCODE } });
  if (city) await db.serviceCity.delete({ where: { id: city.id } });
  if (wh) {
    await db.inventory.deleteMany({ where: { warehouseId: wh.id } });
    await db.warehouse.delete({ where: { id: wh.id } });
  }
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await db.cart.deleteMany({ where: { userId: USER } });
  await db.address.deleteMany({ where: { userId: USER } });
  await db.user.delete({ where: { id: USER } });
  if (createdQaProduct) {
    await db.productVariant.deleteMany({ where: { productId: createdQaProduct } });
    await db.product.delete({ where: { id: createdQaProduct } });
  }
});

test("values are required, never defaulted", async () => {
  await assert.rejects(db.$transaction((tx) => setupDelhiTrial(tx, { stock: NaN, deliveryFeePaise: 0, etaMinutes: 0, live: false })), /--stock/);
});

test("set up off: nothing sold at 110054 until it goes live", async () => {
  await db.$transaction((tx) => setupDelhiTrial(tx, { stock: 5, deliveryFeePaise: 0, etaMinutes: 0, live: false }));
  assert.equal((await checkServiceability(TRIAL_PINCODE)).serviceable, false);
});

test("live: own warehouse, QA stock only, free, no ETA promise, no cash, GST state Delhi; idempotent", async () => {
  await db.$transaction((tx) => setupDelhiTrial(tx, { stock: 5, deliveryFeePaise: 0, etaMinutes: 0, live: true }));
  const r = await db.$transaction((tx) => setupDelhiTrial(tx, { stock: 5, deliveryFeePaise: 0, etaMinutes: 0, live: true }));
  const s = await checkServiceability(TRIAL_PINCODE);
  assert.deepEqual(s, { serviceable: true, etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, state: "Delhi" });
  assert.equal(await db.warehouse.count({ where: { name: TRIAL_WAREHOUSE } }), 1, "rerun made no second warehouse");
  const inv = await db.inventory.findMany({ where: { warehouseId: r.warehouseId }, include: { variant: { select: { sku: true } } } });
  assert.deepEqual(inv.map((i) => [i.variant.sku, i.qtyOnHand]), [[QA_FIXTURE_SKU, 5]], "only the QA item is stocked there");
  assert.equal((await db.serviceablePincode.findUniqueOrThrow({ where: { pincode: TRIAL_PINCODE } })).warehouseId, r.warehouseId);
});

test("a real product cannot be bought at 110054 — no Srinagar stock is borrowed", async () => {
  await assert.rejects(addItem(USER, null, realVariant, 1), /OUT_OF_STOCK/);
});

test("removal: off, excluded, QA stock zeroed, warehouse inactive — nothing deleted", async () => {
  assert.equal(await db.$transaction((tx) => removeDelhiTrial(tx)), true);
  assert.equal((await checkServiceability(TRIAL_PINCODE)).serviceable, false);
  const city = await db.serviceCity.findUniqueOrThrow({ where: { name: TRIAL_CITY } });
  assert.equal(city.isLive, false);
  assert.equal((await db.serviceablePincode.findUniqueOrThrow({ where: { pincode: TRIAL_PINCODE } })).isActive, false);
  const wh = await db.warehouse.findFirstOrThrow({ where: { name: TRIAL_WAREHOUSE } });
  assert.equal(wh.isActive, false);
  assert.equal((await db.inventory.findFirstOrThrow({ where: { warehouseId: wh.id } })).qtyOnHand, 0);
  const actions = (await db.auditLog.findMany({ where: { entityId: city.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
  assert.ok(actions.includes("service_city.qa_trial_setup") && actions.at(-1) === "service_city.qa_trial_removed");
});
