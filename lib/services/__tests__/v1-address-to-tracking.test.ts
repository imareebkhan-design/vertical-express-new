/**
 * The signed-in journey, end to end through the HTTP API the app uses:
 * a pinned address → listed back → edited → re-pinned → checkout refuses a
 * site we do not serve → an order placed at the pinned site → order history →
 * tracking, whose destination is the customer's own pin.
 *
 * Identity is a verified Firebase token stood in by `verify` (as every API
 * suite does); everything after it — validation, services, the database — is
 * the real code against the local test database. The web forms call the same
 * services through Server Actions (actions/address.ts, actions/checkout.ts).
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { addItem } from "@/lib/services/cart";
import {
  handleCreateAddress,
  handleGetOrder,
  handleListAddresses,
  handleListOrders,
  handlePlaceOrder,
  handleUpdateAddress,
} from "@/lib/api/v1";
import { handleOrderTracking } from "@/lib/api/tracking";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { approveSyntheticProductForSale } from "../../../test-support/catalogue-fixtures";
import { liveTestCityId } from "@/test-support/service-city";

const TOKEN = "journey-token";
const UID = `uid-journey-${randomUUID().slice(0, 8)}`;
const SERVED = "999931";
const NOT_SERVED = "999932";
const verify = async (t: string): Promise<DecodedIdToken | null> => (t === TOKEN ? ({ uid: UID } as DecodedIdToken) : null);
const deps = { verify };

let userId: string;
let warehouseId: string;
let productId: string;
let variantId: string;
const savedGateway = process.env.PAYMENT_GATEWAY;

function req(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/v1/x", {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped wire bodies
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

const SITE = {
  label: "site",
  name: "Journey Test",
  phone: "9000000000",
  line1: "House 12, first floor",
  line2: "12 Bund Road, Rajbagh",
  landmark: "Opposite the mosque",
  accessNote: "Truck can reach the rear gate",
  city: "Srinagar",
  state: "Jammu and Kashmir",
};

before(async () => {
  process.env.PAYMENT_GATEWAY = "dummy";
  /* A product must be genuinely sellable under the catalogue gate (lib/catalog-policy.ts):
     a category with a confirmed HSN/GST mapping, then a full synthetic (test-only)
     identity, photo and commercial approval — never the untaxed shortcut. */
  const category = await db.category.findFirst({
    where: { isBulk: false, slug: { in: Object.keys(CATEGORY_TAX_CONFIGS) } },
    select: { id: true },
  });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!category || !brand) throw new Error("Seed must provide a non-bulk category and a brand.");
  userId = (await db.user.create({ data: { id: randomUUID(), firebaseUid: UID, phone: `+9196${String(Math.random()).slice(2, 10)}`, profile: { create: {} } } })).id;
  warehouseId = (await db.warehouse.create({ data: { name: "Journey Test Warehouse", city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({ data: { cityId: await liveTestCityId(), pincode: SERVED, warehouseId, isActive: true, codAllowed: true } });
  productId = (await db.product.create({
    data: { title: "Journey Test Sealant", slug: `journey-sealant-${Date.now()}`, categoryId: category.id, brandId: brand.id, status: "published" },
  })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Tube", sku: `JRN-${Date.now()}`, pricePaise: 19900 } })).id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 50 } });
  await approveSyntheticProductForSale(productId);
});

after(async () => {
  if (savedGateway === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedGateway;
  const orders = { order: { userId } };
  await db.shipmentItem.deleteMany({ where: { shipment: orders } });
  await db.shipment.deleteMany({ where: orders });
  await db.orderItem.deleteMany({ where: orders });
  await db.payment.deleteMany({ where: orders });
  await db.orderStatusEvent.deleteMany({ where: orders });
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.order.deleteMany({ where: { userId } });
  await db.cartItem.deleteMany({ where: { cart: { userId } } });
  await db.cart.deleteMany({ where: { userId } });
  await db.address.deleteMany({ where: { userId } });
  await db.serviceablePincode.deleteMany({ where: { pincode: { in: [SERVED, NOT_SERVED] } } });
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.productImage.deleteMany({ where: { productId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: userId } });
});

test("address → checkout → order → history → tracking, with the customer's pin as the destination", async () => {
  // 1. A pinned address, saved and listed back with its Google fields and the customer's own.
  const pin = { latitude: 34.0662, longitude: 74.8288, placeId: "ChIJ-journey_1" };
  const created = await json(await handleCreateAddress(req("POST", { ...SITE, pincode: SERVED, ...pin }), deps));
  assert.equal(created.body.ok, true, JSON.stringify(created.body));
  const addressId: string = created.body.data.id;
  assert.equal(created.body.data.serviceable, true);

  let listed = (await json(await handleListAddresses(req("GET"), deps))).body.data.find((a: { id: string }) => a.id === addressId);
  assert.deepEqual(
    [listed.latitude, listed.longitude, listed.placeId, listed.pincode, listed.line1, listed.accessNote],
    [34.0662, 74.8288, "ChIJ-journey_1", SERVED, SITE.line1, SITE.accessNote]
  );

  // 2. Edited without the map: the pin goes with it (a moved site must not keep the old gate).
  const edited = await json(await handleUpdateAddress(req("PUT", { ...SITE, line1: "House 14", pincode: SERVED }), addressId, deps));
  assert.equal(edited.status, 200);
  listed = (await json(await handleListAddresses(req("GET"), deps))).body.data.find((a: { id: string }) => a.id === addressId);
  assert.deepEqual([listed.line1, listed.latitude, listed.placeId], ["House 14", null, null]);

  // 3. Re-pinned, and reloaded.
  await handleUpdateAddress(req("PUT", { ...SITE, line1: "House 14", pincode: SERVED, ...pin }), addressId, deps);
  listed = (await json(await handleListAddresses(req("GET"), deps))).body.data.find((a: { id: string }) => a.id === addressId);
  assert.deepEqual([listed.latitude, listed.longitude, listed.placeId], [34.0662, 74.8288, "ChIJ-journey_1"]);

  // 4. Checkout refuses a site we do not serve — the saved address does not get to decide.
  const away = await json(await handleCreateAddress(req("POST", { ...SITE, pincode: NOT_SERVED, latitude: 28.6, longitude: 77.2 }), deps));
  assert.equal(away.body.data.serviceable, false);
  await addItem(userId, null, variantId, 1);
  const refused = await json(await handlePlaceOrder(req("POST", { addressId: away.body.data.id, paymentMethod: "online", idempotencyKey: `jrn-away-${randomUUID()}` }), deps));
  assert.equal(refused.body.ok, false, "no order to a pincode we do not serve");
  assert.equal(await db.order.count({ where: { userId } }), 0);

  // 5. The order, placed at the pinned site.
  const placed = await json(await handlePlaceOrder(req("POST", { addressId, paymentMethod: "online", idempotencyKey: `jrn-${randomUUID()}` }), deps));
  assert.equal(placed.body.ok, true, JSON.stringify(placed.body));
  const orderNo: string = placed.body.data.orderNo;
  const order = await db.order.findUniqueOrThrow({ where: { orderNo }, include: { shipments: true } });
  const snap = order.address as Record<string, unknown>;
  assert.deepEqual([snap.latitude, snap.longitude, snap.placeId, snap.line1, snap.accessNote], [34.0662, 74.8288, "ChIJ-journey_1", "House 14", SITE.accessNote]);
  assert.equal(order.totalPaise, 19900);
  assert.ok(order.shipments.length >= 1, "checkout wrote its shipment");

  // 6. Order history and the order itself.
  const history = await json(await handleListOrders(req("GET"), deps));
  assert.ok(history.body.data.orders.some((o: { orderNo: string }) => o.orderNo === orderNo));
  const detail = await json(await handleGetOrder(req("GET"), orderNo, deps));
  assert.equal(detail.body.data.address.placeId, "ChIJ-journey_1");

  // 7. Tracking: the destination is the customer's pin; no rider yet, so no ETA invented.
  const tracking = await json(await handleOrderTracking(req("GET"), orderNo, { ...deps, tracking: { routesEnabled: false } }));
  assert.equal(tracking.status, 200);
  assert.deepEqual(tracking.body.data.destination, { lat: 34.0662, lng: 74.8288 });
  for (const s of tracking.body.data.shipments) assert.equal(s.route, null);
});
