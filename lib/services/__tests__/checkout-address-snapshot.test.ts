/**
 * The order goes to the address the customer confirmed — exactly that one,
 * pin included — and never to another.
 *
 * Staging order VE-2026-MVC648PX1424 was paid with the snapshot of an old,
 * unpinned address while the account had a pinned default and had just saved a
 * new pinned site. The server side of that is pinned down here: `placeOrder`
 * snapshots the address id it is given, and an id that is not the customer's
 * (deleted, or someone else's) is refused outright rather than replaced with
 * their default. All data is created and deleted by this file (`ZZZAS…`).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { addItem } from "../cart";
import { placeOrder } from "../checkout";
import { approveTestProductsCreatedSince } from "../../../test-support/catalogue-fixtures";
import { liveTestCityId } from "@/test-support/service-city";

const SUITE_START = new Date();
const PINCODE = "999931";
const OTHER_PINCODE = "999932";
const STATE = "Jammu & Kashmir";
const USER = randomUUID();
const STRANGER = randomUUID();
const TAG = `ZZZAS${Date.now() % 1_000_000}`;
const ids = { warehouse: "", product: "", variant: "", pinnedDefault: "", oldUnpinned: "", deleted: "", strangers: "" };
let savedCod: Awaited<ReturnType<typeof db.setting.findUnique>>;
const savedGateway = process.env.PAYMENT_GATEWAY;

const address = (userId: string, o: { pincode: string; line1: string; pin?: [number, number]; isDefault?: boolean; deletedAt?: Date }) =>
  db.address.create({
    data: {
      userId, name: "Snapshot Buyer", phone: "9876543210", line1: o.line1, city: "Srinagar", state: STATE, pincode: o.pincode,
      isDefault: o.isDefault ?? false, deletedAt: o.deletedAt ?? null,
      ...(o.pin ? { latitude: o.pin[0], longitude: o.pin[1], placeId: `place-${o.line1}` } : {}),
    },
  });

before(async () => {
  savedCod = await db.setting.findUnique({ where: { key: "cod.enabled" } });
  await db.setting.upsert({ where: { key: "cod.enabled" }, create: { key: "cod.enabled", value: "true" }, update: { value: "true" } });
  process.env.PAYMENT_GATEWAY = "dummy";
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const category = await db.category.findFirstOrThrow({ where: { isBulk: false }, select: { id: true } });
  for (const id of [USER, STRANGER]) await db.user.create({ data: { id } });
  ids.warehouse = (await db.warehouse.create({ data: { name: `${TAG} Warehouse`, city: "Srinagar", pincode: "190001" } })).id;
  const cityId = await liveTestCityId();
  for (const pincode of [PINCODE, OTHER_PINCODE]) {
    await db.serviceablePincode.create({ data: { cityId, pincode, warehouseId: ids.warehouse, isActive: true, codAllowed: true, deliveryFeePaise: 4900 } });
  }
  ids.pinnedDefault = (await address(USER, { pincode: PINCODE, line1: "Pinned default", pin: [34.0837, 74.7973], isDefault: true })).id;
  ids.oldUnpinned = (await address(USER, { pincode: OTHER_PINCODE, line1: "Old unpinned" })).id;
  ids.deleted = (await address(USER, { pincode: PINCODE, line1: "Deleted site", pin: [34.1, 74.8], deletedAt: new Date() })).id;
  ids.strangers = (await address(STRANGER, { pincode: PINCODE, line1: "Not yours", pin: [34.2, 74.9] })).id;
  ids.product = (await db.product.create({
    data: { status: "published", title: `${TAG} item`, slug: `${TAG.toLowerCase()}-item`, categoryId: category.id, brandId: brand.id },
  })).id;
  ids.variant = (await db.productVariant.create({ data: { productId: ids.product, name: "Unit", sku: `${TAG}-item`, pricePaise: 19900, isDefault: true } })).id;
  await db.inventory.create({ data: { variantId: ids.variant, warehouseId: ids.warehouse, qtyOnHand: 50 } });
  await approveTestProductsCreatedSince(SUITE_START);
});

beforeEach(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await addItem(USER, null, ids.variant, 1);
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
  await db.auditLog.deleteMany({ where: { actorId: USER } });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.cartItem.deleteMany({ where: { cart: { userId: USER } } });
  await db.cart.deleteMany({ where: { userId: USER } });
  await db.address.deleteMany({ where: { userId: { in: [USER, STRANGER] } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: { in: [PINCODE, OTHER_PINCODE] } } });
  await db.stockMovement.deleteMany({ where: { variantId: ids.variant } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId: ids.variant } });
  await db.productVariant.deleteMany({ where: { productId: ids.product } });
  await db.product.deleteMany({ where: { id: ids.product } });
  await db.warehouse.deleteMany({ where: { id: ids.warehouse } });
  await db.user.deleteMany({ where: { id: { in: [USER, STRANGER] } } });
});

const place = (addressId: string) => placeOrder({ userId: USER, addressId, paymentMethod: "cod", idempotencyKey: randomUUID() });
const snapshot = async (orderNo: string) =>
  (await db.order.findUniqueOrThrow({ where: { orderNo }, select: { address: true } })).address as Record<string, unknown>;

test("the pinned address that was chosen is the one snapshotted, pin and all", async () => {
  const placed = await place(ids.pinnedDefault);
  const a = await snapshot(placed.orderNo);
  assert.equal(a.line1, "Pinned default");
  assert.equal(a.pincode, PINCODE);
  assert.equal(a.latitude, 34.0837);
  assert.equal(a.longitude, 74.7973);
  assert.equal(a.placeId, "place-Pinned default");
});

test("choosing a non-default, unpinned address snapshots that one — not the default", async () => {
  const placed = await place(ids.oldUnpinned);
  const a = await snapshot(placed.orderNo);
  assert.equal(a.line1, "Old unpinned");
  assert.equal(a.pincode, OTHER_PINCODE);
  assert.equal(a.latitude, null, "no pin is invented for a manual address");
});

test("a deleted address is refused, never replaced by the default", async () => {
  const before = await db.order.count({ where: { userId: USER } });
  await assert.rejects(place(ids.deleted));
  assert.equal(await db.order.count({ where: { userId: USER } }), before, "no order was created");
});

test("someone else's address is refused, never replaced by the customer's own", async () => {
  const before = await db.order.count({ where: { userId: USER } });
  await assert.rejects(place(ids.strangers));
  assert.equal(await db.order.count({ where: { userId: USER } }), before);
});
