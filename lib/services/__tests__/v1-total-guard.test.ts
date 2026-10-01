import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { addItem, updateItemQty } from "@/lib/services/cart";
import { handleCheckoutTotals, handlePlaceOrder } from "@/lib/api/v1";

/**
 * The native app's placement, when the cart moved after its quote.
 *
 * The app quotes once for the pincode and coupon on screen. If the customer
 * changes the cart elsewhere (the website, another device), placement used to
 * price the new cart and create the order — for COD, at a total the app never
 * showed. The web closed this in E8 with `expectedTotalPaise`; the native API
 * now takes the same optional field. These tests prove the boundary:
 *
 *   - a stale total is refused as CONFLICT + `totalChanged`, with no order, no
 *     stock movement and the cart untouched;
 *   - the current total places the order;
 *   - an app build that sends no total keeps its old behaviour;
 *   - a malformed total is a validation failure, never a silent pass.
 */

const PINCODE = "999946";
const TOKEN = "token-guard";
const UID = `uid-v1-guard-${randomUUID().slice(0, 8)}`;

const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN ? ({ uid: UID } as unknown as DecodedIdToken) : null;

let userId: string;
let warehouseId: string;
let variantId: string;
let productSlug: string;
let addressId: string;

function req(body: unknown): Request {
  return new Request("http://localhost/api/v1/checkout/orders", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function quote(): Promise<number> {
  const res = await json(
    await handleCheckoutTotals(
      new Request("http://localhost/api/v1/checkout/totals", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ pincode: PINCODE }),
      }),
      { verify }
    )
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.totalPaise as number;
}

const cartLine = async () => {
  const cart = await db.cart.findUniqueOrThrow({ where: { userId }, include: { items: true } });
  return cart.items[0];
};
const orderCount = () => db.order.count({ where: { userId } });
const onHand = async () =>
  (await db.inventory.findFirstOrThrow({ where: { variantId, warehouseId } })).qtyOnHand;

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const warehouse = await db.warehouse.create({
    data: { name: "ZZZ Guard Warehouse", city: "Srinagar", pincode: "190001" },
  });
  warehouseId = warehouse.id;
  await db.serviceablePincode.create({
    data: { pincode: PINCODE, warehouseId, isActive: true, etaMinutes: 240, deliveryFeePaise: 5000, codAllowed: true },
  });
  userId = (
    await db.user.create({
      data: { id: randomUUID(), firebaseUid: UID, phone: `+9197${String(Math.random()).slice(2, 10)}` },
      select: { id: true },
    })
  ).id;
  const tag = randomUUID().slice(0, 8);
  productSlug = `zzz-guard-${tag}`;
  const product = await db.product.create({
    data: {
      slug: productSlug,
      title: "ZZZ Guard Switch",
      brandId: brand.id,
      categoryId: category.id,
      unitLabel: "per piece",
      status: "published",
      variants: { create: [{ sku: `ZZZ-GUARD-${tag}`, name: "16 A", pricePaise: 9200, isDefault: true }] },
    },
    include: { variants: true },
  });
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 50, qtyReserved: 0 } });
  addressId = (
    await db.address.create({
      data: {
        userId,
        label: "site",
        name: "ZZZ Guard Buyer",
        phone: "9876543210",
        line1: "Plot 9",
        city: "Srinagar",
        state: "Jammu & Kashmir",
        pincode: PINCODE,
        isDefault: true,
      },
    })
  ).id;
});

after(async () => {
  const orders = await db.order.findMany({ where: { userId }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.shipmentItem.deleteMany({ where: { shipment: { orderId: { in: orderIds } } } });
  await db.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.cartItem.deleteMany({ where: { cart: { userId } } });
  await db.cart.deleteMany({ where: { userId } });
  await db.address.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.inventory.deleteMany({ where: { variantId } });
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { slug: productSlug } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PINCODE } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

test("native placement: a total the cart no longer has is refused, and nothing is written", async () => {
  await addItem(userId, null, variantId, 3);
  const shown = await quote();

  /* The same cart, changed elsewhere after the app's quote. */
  const line = await cartLine();
  await updateItemQty(userId, null, line.id, 1);
  const before = { orders: await orderCount(), stock: await onHand() };

  const res = await json(
    await handlePlaceOrder(
      req({ addressId, paymentMethod: "cod", idempotencyKey: `idem-${randomUUID()}`, expectedTotalPaise: shown }),
      { verify }
    )
  );
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.error.code, "CONFLICT");
  assert.equal(res.body.error.metadata?.totalChanged, true);
  assert.equal(await orderCount(), before.orders, "no order for a total the customer did not see");
  assert.equal(await onHand(), before.stock, "no stock moved");
  assert.equal((await cartLine()).qty, 1, "the cart is left as it is");
});

test("native placement: the current total places the order at that total", async () => {
  const shown = await quote();
  const res = await json(
    await handlePlaceOrder(
      req({ addressId, paymentMethod: "cod", idempotencyKey: `idem-${randomUUID()}`, expectedTotalPaise: shown }),
      { verify }
    )
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const order = await db.order.findFirstOrThrow({ where: { orderNo: res.body.data.orderNo } });
  assert.equal(order.totalPaise, shown);
});

test("native placement: an app build that sends no total keeps its behaviour", async () => {
  await addItem(userId, null, variantId, 2);
  const res = await json(
    await handlePlaceOrder(req({ addressId, paymentMethod: "cod", idempotencyKey: `idem-${randomUUID()}` }), { verify })
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
});

test("native placement: a malformed total is a validation failure, not a pass", async () => {
  await addItem(userId, null, variantId, 1);
  const before = await orderCount();
  for (const expectedTotalPaise of [-1, 12.5, "4000", Number.MAX_SAFE_INTEGER + 2]) {
    const res = await json(
      await handlePlaceOrder(
        req({ addressId, paymentMethod: "cod", idempotencyKey: `idem-${randomUUID()}`, expectedTotalPaise }),
        { verify }
      )
    );
    assert.equal(res.status, 400, `${String(expectedTotalPaise)} → ${JSON.stringify(res.body)}`);
    assert.equal(res.body.error.code, "VALIDATION");
  }
  assert.equal(await orderCount(), before);
});
