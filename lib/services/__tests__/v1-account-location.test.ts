import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { addItem } from "@/lib/services/cart";
import {
  handleGetMe,
  handleUpdateMe,
  handleReverseGeocode,
  handleUpdateAddress,
  handleDeleteAddress,
  handleListAddresses,
  handleGetCart,
  handlePlaceOrder,
  handleListOrders,
  handleGetOrder,
  handleReorder,
} from "@/lib/api/v1";
import type { ParsedGeocode } from "@/lib/geocode-parse";

/**
 * The Round 2 endpoints: who the customer is (and whether they are new),
 * where they are, which site they deliver to, and the shipment split the cart
 * shows. Google is stubbed through `deps.geocode`; the serviceability answer
 * is the real `ServiceablePincode` table, because that is the point.
 */

const PIN_SERVED = "999933";
const PIN_UNSERVED = "999932";
const TOKEN_A = "token-a";
const TOKEN_B = "token-b";
const UID_A = `uid-r2-a-${randomUUID().slice(0, 8)}`;
const UID_B = `uid-r2-b-${randomUUID().slice(0, 8)}`;

const verify = async (token: string): Promise<DecodedIdToken | null> => {
  if (token === TOKEN_A) return { uid: UID_A } as unknown as DecodedIdToken;
  if (token === TOKEN_B) return { uid: UID_B } as unknown as DecodedIdToken;
  return null;
};

let userA: string;
let userB: string;
let warehouseId: string;
let variantId: string;
let productSlug: string;
let siteA: string;
let siteB: string;

function req(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function json(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const geoAt = (pincode: string): (() => Promise<ParsedGeocode>) => async () => ({
  kind: "found",
  address: { line1: "12, Link Road", locality: "Hyderpora", city: "Srinagar", state: "Jammu and Kashmir", pincode },
});

before(async () => {
  const category = await db.category.findFirstOrThrow({ where: { isBulk: true }, select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const warehouse = await db.warehouse.create({ data: { name: "ZZZ R2 Warehouse", city: "Srinagar", pincode: "190001" } });
  warehouseId = warehouse.id;
  await db.serviceablePincode.create({
    data: { pincode: PIN_SERVED, warehouseId, isActive: true, etaMinutes: 90, deliveryFeePaise: 4000, codAllowed: true },
  });

  const mkUser = async (uid: string) =>
    (
      await db.user.create({
        data: { id: randomUUID(), firebaseUid: uid, phone: `+9197${String(Math.random()).slice(2, 10)}`, profile: { create: {} } },
        select: { id: true },
      })
    ).id;
  userA = await mkUser(UID_A);
  userB = await mkUser(UID_B);

  const tag = randomUUID().slice(0, 8);
  productSlug = `zzz-r2-${tag}`;
  const product = await db.product.create({
    data: {
      slug: productSlug,
      title: "ZZZ R2 Cement 50 kg",
      brandId: brand.id,
      categoryId: category.id,
      unitLabel: "per bag",
      status: "published",
      variants: { create: [{ sku: `ZZZ-R2-${tag}`, name: "50 kg", pricePaise: 40000, isDefault: true }] },
    },
    include: { variants: true },
  });
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 50, qtyReserved: 0 } });

  const mkSite = (name: string, isDefault: boolean) =>
    db.address.create({
      data: {
        userId: userA,
        label: "site",
        name,
        phone: "9876543210",
        line1: `${name} plot`,
        city: "Srinagar",
        state: "Jammu & Kashmir",
        pincode: PIN_SERVED,
        isDefault,
      },
    });
  siteA = (await mkSite("Hyderpora Site", true)).id;
  siteB = (await mkSite("Rajbagh House", false)).id;
});

after(async () => {
  const users = [userA, userB].filter(Boolean);
  const orderIds = (await db.order.findMany({ where: { userId: { in: users } }, select: { id: true } })).map((o) => o.id);
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.shipmentItem.deleteMany({ where: { shipment: { orderId: { in: orderIds } } } });
  await db.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.cartItem.deleteMany({ where: { cart: { userId: { in: users } } } });
  await db.cart.deleteMany({ where: { userId: { in: users } } });
  await db.address.deleteMany({ where: { userId: { in: users } } });
  await db.profile.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  if (variantId) {
    await db.inventory.deleteMany({ where: { variantId } });
    await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
    await db.productVariant.deleteMany({ where: { id: variantId } });
  }
  await db.product.deleteMany({ where: { slug: productSlug } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PIN_SERVED } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.rateLimit.deleteMany({ where: { bucket: { startsWith: "api-geo:" } } }).catch(() => {});
});

test("the new routes refuse a caller with no token", async () => {
  const calls = await Promise.all([
    handleGetMe(req("GET", "/x"), { verify }),
    handleUpdateMe(req("PATCH", "/x", { body: { fullName: "X Y" } }), { verify }),
    handleReverseGeocode(req("GET", "/x?lat=34&lng=74"), { verify, geocode: geoAt(PIN_SERVED) }),
    handleUpdateAddress(req("PATCH", "/x", { body: { isDefault: true } }), siteB, { verify }),
    handleDeleteAddress(req("DELETE", "/x"), siteB, { verify }),
    handleReorder(req("POST", "/x"), "VE-1", { verify }),
  ]);
  for (const res of calls) assert.equal(res.status, 401);
});

test("me: a brand-new customer has zero orders and no name; a name can be set", async () => {
  const first = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(first.status, 200);
  assert.equal(first.body.data.orderCount, 0);
  assert.equal(first.body.data.fullName, null);

  const bad = await json(await handleUpdateMe(req("PATCH", "/x", { token: TOKEN_A, body: { fullName: " " } }), { verify }));
  assert.equal(bad.status, 400);
  const empty = await json(await handleUpdateMe(req("PATCH", "/x", { token: TOKEN_A, body: {} }), { verify }));
  assert.equal(empty.status, 400);

  const named = await json(
    await handleUpdateMe(req("PATCH", "/x", { token: TOKEN_A, body: { fullName: "  Bilal Ahmad " } }), { verify })
  );
  assert.equal(named.body.data.fullName, "Bilal Ahmad");
  const again = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(again.body.data.fullName, "Bilal Ahmad");
});

test("onboardedAt: null until closed once, by an answer or a skip, never a client timestamp", async () => {
  const before = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(before.body.data.onboardedAt, null, "a profile this suite created carries no backfilled value");

  /* A raw timestamp is not the accepted shape — only the literal command. */
  const rejected = await json(
    await handleUpdateMe(req("PATCH", "/x", { token: TOKEN_A, body: { onboardedAt: "2020-01-01T00:00:00.000Z" } }), { verify })
  );
  assert.equal(rejected.status, 400);

  const closed = await json(await handleUpdateMe(req("PATCH", "/x", { token: TOKEN_A, body: { onboardedAt: "now" } }), { verify }));
  assert.equal(closed.status, 200);
  assert.equal(typeof closed.body.data.onboardedAt, "string");
  const closedAt = closed.body.data.onboardedAt;

  const after = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(after.body.data.onboardedAt, closedAt, "survives independently of fullName/buyerType — an account fact, not a device flag");
});

test("me: the customer's own business and GSTIN — validated, normalised, clearable", async () => {
  const start = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(start.body.data.gstin, null);
  assert.equal(start.body.data.companyName, null);

  /* One character off GSTN's published example: the check digit catches it. */
  const typo = await json(await handleUpdateMe(req("PATCH", "/x", { token: TOKEN_A, body: { gstin: "27AAPFU0939F1ZW" } }), { verify }));
  assert.equal(typo.status, 400);
  assert.equal(typo.body.error.field, "gstin");

  const saved = await json(
    await handleUpdateMe(
      req("PATCH", "/x", { token: TOKEN_A, body: { companyName: " Ahmad Builders ", gstin: "27aapfu 0939f1zv" } }),
      { verify }
    )
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.companyName, "Ahmad Builders");
  assert.equal(saved.body.data.gstin, "27AAPFU0939F1ZV");

  const cleared = await json(await handleUpdateMe(req("PATCH", "/x", { token: TOKEN_A, body: { gstin: null } }), { verify }));
  assert.equal(cleared.body.data.gstin, null);
  assert.equal(cleared.body.data.companyName, "Ahmad Builders", "clearing one field leaves the other");

  /* B never sees A's business. */
  const other = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_B }), { verify }));
  assert.notEqual(other.body.data.companyName, "Ahmad Builders");
});

test("reverse geocode: Google supplies the pincode, ServiceablePincode decides delivery", async () => {
  const served = await json(
    await handleReverseGeocode(req("GET", "/x?lat=34.07&lng=74.8", { token: TOKEN_A }), { verify, geocode: geoAt(PIN_SERVED) })
  );
  assert.equal(served.status, 200);
  assert.equal(served.body.data.address.pincode, PIN_SERVED);
  assert.deepEqual(served.body.data.serviceability, {
    serviceable: true,
    etaMinutes: 90,
    deliveryFeePaise: 4000,
    codAllowed: true,
  });

  const unserved = await json(
    await handleReverseGeocode(req("GET", "/x?lat=34.07&lng=74.8", { token: TOKEN_A }), { verify, geocode: geoAt(PIN_UNSERVED) })
  );
  assert.equal(unserved.status, 200);
  assert.equal(unserved.body.data.serviceability.serviceable, false);
});

test("reverse geocode: failures are distinct and all leave the manual path open", async () => {
  const badCoords = await handleReverseGeocode(req("GET", "/x?lat=200&lng=0", { token: TOKEN_A }), {
    verify,
    geocode: geoAt(PIN_SERVED),
  });
  assert.equal(badCoords.status, 400);

  const missing = await handleReverseGeocode(req("GET", "/x?lat=34", { token: TOKEN_A }), { verify, geocode: geoAt(PIN_SERVED) });
  assert.equal(missing.status, 400);

  const noPin = await json(
    await handleReverseGeocode(req("GET", "/x?lat=34&lng=74", { token: TOKEN_A }), {
      verify,
      geocode: async () => ({ kind: "no_pincode" }),
    })
  );
  assert.equal(noPin.status, 404);
  assert.equal(noPin.body.error.metadata.reason, "NO_PINCODE");

  const down = await json(
    await handleReverseGeocode(req("GET", "/x?lat=34&lng=74", { token: TOKEN_A }), {
      verify,
      geocode: async () => ({ kind: "provider_error", status: "NOT_CONFIGURED" }),
    })
  );
  assert.equal(down.status, 503);
  assert.equal(down.body.error.metadata.reason, "NOT_CONFIGURED");
});

test("addresses: each site says whether it is delivered to, from ServiceablePincode", async (t) => {
  const outside = await db.address.create({
    data: {
      userId: userA,
      label: "home",
      name: "Outside",
      phone: "9876543210",
      line1: "Beyond the service area",
      city: "Elsewhere",
      state: "Jammu & Kashmir",
      pincode: PIN_UNSERVED,
      isDefault: false,
    },
  });
  t.after(() => db.address.delete({ where: { id: outside.id } }));

  const list = await json(await handleListAddresses(req("GET", "/x", { token: TOKEN_A }), { verify }));
  const byId = new Map(list.body.data.map((a: { id: string; serviceable: boolean }) => [a.id, a.serviceable]));
  assert.equal(byId.get(siteA), true);
  assert.equal(byId.get(outside.id), false);
});

test("addresses: select a delivery site, refuse another customer's, delete and promote", async () => {
  const select = await json(
    await handleUpdateAddress(req("PATCH", "/x", { token: TOKEN_A, body: { isDefault: true } }), siteB, { verify })
  );
  assert.equal(select.status, 200);
  const list = await json(await handleListAddresses(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(list.body.data[0].id, siteB, "the selected site is the default and listed first");
  assert.equal(list.body.data.filter((a: { isDefault: boolean }) => a.isDefault).length, 1);

  const foreign = await handleUpdateAddress(req("PATCH", "/x", { token: TOKEN_B, body: { isDefault: true } }), siteA, { verify });
  assert.equal(foreign.status, 404);
  const foreignDelete = await handleDeleteAddress(req("DELETE", "/x", { token: TOKEN_B }), siteA, { verify });
  assert.equal(foreignDelete.status, 404);
  assert.equal((await handleUpdateAddress(req("PATCH", "/x", { token: TOKEN_A, body: { isDefault: true } }), "nope", { verify })).status, 404);

  const edit = await json(
    await handleUpdateAddress(
      req("PATCH", "/x", {
        token: TOKEN_A,
        body: {
          label: "site",
          name: "Rajbagh House",
          phone: "9876543210",
          line1: "Rajbagh plot",
          accessNote: "Narrow lane — small vehicle only.",
          city: "Srinagar",
          state: "Jammu & Kashmir",
          pincode: PIN_UNSERVED,
          isDefault: true,
        },
      }),
      siteB,
      { verify }
    )
  );
  assert.equal(edit.status, 200);
  assert.equal(edit.body.data.serviceable, false, "an edit reports the new pincode's serviceability");
  const row = await db.address.findUniqueOrThrow({ where: { id: siteB } });
  assert.equal(row.accessNote, "Narrow lane — small vehicle only.", "an edit keeps the access note it was sent");

  const del = await handleDeleteAddress(req("DELETE", "/x", { token: TOKEN_A }), siteB, { verify });
  assert.equal(del.status, 200);
  const after = await json(await handleListAddresses(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(after.body.data.length, 1);
  assert.equal(after.body.data[0].id, siteA);
  assert.equal(after.body.data[0].isDefault, true, "deleting the default promotes the remaining site");
});

test("cart carries the server's shipment plan", async () => {
  await addItem(userA, null, variantId, 2);
  const cart = await json(await handleGetCart(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(cart.status, 200);
  const itemId = cart.body.data.lines[0].itemId;
  assert.deepEqual(cart.body.data.shipments, [{ sequence: 1, speedClass: "scheduled", itemIds: [itemId] }]);
});

test("after an order: returning customer, order carries slug + site, detail carries shipments, reorder refills", async () => {
  const placed = await json(
    await handlePlaceOrder(
      req("POST", "/x", { token: TOKEN_A, body: { addressId: siteA, paymentMethod: "cod", idempotencyKey: `r2-${randomUUID()}` } }),
      { verify }
    )
  );
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  const orderNo = placed.body.data.orderNo;

  const me = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(me.body.data.orderCount, 1);
  const other = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_B }), { verify }));
  assert.equal(other.body.data.orderCount, 0, "one customer's history never makes another returning");

  /* A cancelled order is not something to order again. */
  await db.order.update({ where: { orderNo }, data: { status: "cancelled" } });
  const cancelled = await json(await handleGetMe(req("GET", "/x", { token: TOKEN_A }), { verify }));
  assert.equal(cancelled.body.data.orderCount, 0);
  await db.order.update({ where: { orderNo }, data: { status: "confirmed" } });

  const list = await json(await handleListOrders(req("GET", "/x", { token: TOKEN_A }), { verify }));
  const summary = list.body.data.orders[0];
  assert.equal(summary.items[0].productSlug, productSlug);
  assert.equal(summary.items[0].variantId, variantId);
  assert.equal(summary.site.pincode, PIN_SERVED);
  assert.equal(summary.site.name, "Hyderpora Site");

  const detail = await json(await handleGetOrder(req("GET", "/x", { token: TOKEN_A }), orderNo, { verify }));
  assert.equal(detail.body.data.shipments.length, 1);
  assert.equal(detail.body.data.shipments[0].speedClass, "scheduled");
  assert.equal(detail.body.data.shipments[0].promisedAt, null, "no slot promise exists to report");

  const foreign = await handleReorder(req("POST", "/x", { token: TOKEN_B }), orderNo, { verify });
  assert.equal(foreign.status, 404);
  const refill = await json(await handleReorder(req("POST", "/x", { token: TOKEN_A }), orderNo, { verify }));
  assert.equal(refill.status, 200);
  assert.equal(refill.body.data.count, 2);
});
