/**
 * `/api/v1/coupon/validate` — the mobile door onto the coupon engine.
 *
 * `Cart / coupon` sat in the parity matrix as "completely missing, API gap"
 * (class A/H). The engine was never missing — `resolveCoupon`/`computeTotals`
 * already power the web's own `validateCoupon` action and the existing
 * `/api/v1/checkout/totals` route. What was missing was a route that reports
 * an invalid code as an explicit failure rather than a silent `discountPaise:
 * 0` — exactly the ambiguity `validateCoupon`'s own comment describes fixing
 * on the web once already (`actions/checkout.ts`). These tests pin that this
 * route makes the same distinction over the wire.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { addItem } from "@/lib/services/cart";
import { handleValidateCoupon } from "@/lib/api/v1";

const TOKEN = "token-coupon-v1";
const UID = `uid-coupon-v1-${randomUUID().slice(0, 8)}`;
const TEST_PINCODE = "999908";
const COUPON_CODE = `V1CPNTEST${Date.now() % 100000}`;

const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN ? ({ uid: UID } as unknown as DecodedIdToken) : null;

function req(body: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/v1/coupon/validate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

let userId: string;
let warehouseId: string;
let productId: string;
let variantId: string;

before(async () => {
  const user = await db.user.create({
    data: {
      id: randomUUID(),
      firebaseUid: UID,
      phone: `+9198${String(Math.random()).slice(2, 10)}`,
      profile: { create: {} },
    },
    select: { id: true },
  });
  userId = user.id;

  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });

  const wh = await db.warehouse.create({
    data: { name: "V1 Coupon Test Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = wh.id;

  await db.serviceablePincode.create({
    data: { pincode: TEST_PINCODE, warehouseId, isActive: true, codAllowed: true },
  });

  const product = await db.product.create({
    data: {
      title: "V1 Coupon Test Item",
      slug: `v1-coupon-test-${Date.now()}`,
      categoryId: category.id,
      brandId: brand.id,
      status: "published",
    },
  });
  productId = product.id;
  const variant = await db.productVariant.create({
    data: { productId, name: "Unit", sku: `SKU-V1CPN-${Date.now()}`, pricePaise: 100000, isDefault: true },
  });
  variantId = variant.id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 100 } });

  await db.coupon.create({
    data: { code: COUPON_CODE, type: "flat", value: 20000, minOrderPaise: 0, isActive: true },
  });

  /* Stock resolution maps the user's address to a warehouse — without one,
     `addItem` finds no warehouse to check and refuses as out of stock. */
  await db.address.create({
    data: {
      userId,
      name: "Coupon Test Buyer",
      phone: "9876543210",
      line1: "Plot 9",
      city: "Srinagar",
      state: "Jammu & Kashmir",
      pincode: TEST_PINCODE,
      isDefault: true,
    },
  });

  await addItem(userId, null, variantId, 1);
});

after(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId } } });
  await db.cart.deleteMany({ where: { userId } });
  await db.address.deleteMany({ where: { userId } });
  await db.coupon.deleteMany({ where: { code: COUPON_CODE } });
  await db.serviceablePincode.deleteMany({ where: { pincode: TEST_PINCODE } });
  if (variantId) {
    await db.inventory.deleteMany({ where: { variantId } });
    await db.productVariant.delete({ where: { id: variantId } });
  }
  if (productId) await db.product.delete({ where: { id: productId } });
  if (warehouseId) await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.delete({ where: { id: userId } });
});

test("a request with no bearer token is refused", async () => {
  const res = await json(await handleValidateCoupon(req({ code: COUPON_CODE, pincode: TEST_PINCODE }), { verify }));
  assert.equal(res.status, 401);
});

test("a valid coupon returns the discounted total", async () => {
  const res = await json(
    await handleValidateCoupon(req({ code: COUPON_CODE, pincode: TEST_PINCODE }, TOKEN), { verify })
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.data.discountPaise, 20000);
});

test("an unknown code is an explicit failure, not a silent zero discount", async () => {
  const res = await json(
    await handleValidateCoupon(req({ code: "NOT-A-REAL-CODE", pincode: TEST_PINCODE }, TOKEN), { verify })
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error.message, /not valid/i);
});

test("an invalid pincode is rejected before touching the coupon engine", async () => {
  const res = await json(
    await handleValidateCoupon(req({ code: COUPON_CODE, pincode: "abc" }, TOKEN), { verify })
  );
  assert.equal(res.status, 400);
});
