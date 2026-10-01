import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { addItem } from "@/lib/services/cart";
import { placeOrder } from "../checkout";

/**
 * A double-tapped "Pay" — the same checkout submitted several times at once.
 *
 * Every client sends one idempotency key per checkout (desktop, phone-web and
 * native). A retry after a lost response is already covered by v1-journey's
 * recovery test, but that one is sequential: the second request finds the
 * first order and replays it. Simultaneous submissions all pass that lookup
 * before any of them commits, so what stops them is the unique index on
 * orders.idempotency_key — the losers must roll back entirely (no second
 * order, no second stock decrement, no second payment row) and hand back the
 * winner's order rather than an error.
 */

const PARALLEL = 4;
const QTY = 2;
const PINCODE = `99${String(Date.now()).slice(-4)}`;
const TAG = randomUUID().slice(0, 8);

let userId: string;
let warehouseId: string;
let variantId: string;
let productSlug: string;
let addressId: string;

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const warehouse = await db.warehouse.create({
    data: { name: `ZZZ Concurrency ${TAG}`, city: "Srinagar", pincode: "190001" },
  });
  warehouseId = warehouse.id;
  await db.serviceablePincode.create({
    data: { pincode: PINCODE, warehouseId, isActive: true, etaMinutes: 240, deliveryFeePaise: 5000 },
  });

  /* The customer is the test's own — no phone or email, so nothing unique can collide. */
  userId = (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;

  productSlug = `zzz-concurrency-${TAG}`;
  const product = await db.product.create({
    data: {
      slug: productSlug,
      title: "ZZZ Concurrency Cement 50 kg",
      brandId: brand.id,
      categoryId: category.id,
      unitLabel: "per bag",
      status: "published",
      variants: { create: [{ sku: `ZZZ-CC-${TAG}`, name: "50 kg", pricePaise: 40000, isDefault: true }] },
    },
    include: { variants: true },
  });
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 20, qtyReserved: 0 } });

  addressId = (
    await db.address.create({
      data: {
        userId, label: "site", name: "Concurrency Test", phone: "9876543210",
        line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: PINCODE,
      },
      select: { id: true },
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
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { slug: productSlug } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PINCODE } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

test("simultaneous submissions of one checkout make one order, one payment, one stock decrement", async () => {
  await addItem(userId, null, variantId, QTY);
  const before = await db.inventory.findUniqueOrThrow({
    where: { variantId_warehouseId: { variantId, warehouseId } },
  });
  const key = `idem-concurrent-${randomUUID()}`;

  const results = await Promise.allSettled(
    Array.from({ length: PARALLEL }, () =>
      placeOrder({ userId, addressId, paymentMethod: "dummy", idempotencyKey: key })
    )
  );

  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(
    rejected.length,
    0,
    `a duplicate submission surfaced an error instead of the existing order: ${rejected
      .map((r) => String((r as PromiseRejectedResult).reason))
      .join(" | ")}`
  );
  const orderNos = new Set(
    results.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof placeOrder>>>).value.orderNo)
  );
  assert.equal(orderNos.size, 1, `the submissions were answered with different orders: ${[...orderNos].join(", ")}`);

  const orders = await db.order.findMany({ where: { userId }, select: { id: true, idempotencyKey: true } });
  assert.equal(orders.length, 1, "more than one order exists for one checkout");
  assert.equal(orders[0].idempotencyKey, key);

  assert.equal(await db.payment.count({ where: { orderId: orders[0].id } }), 1, "more than one payment row");

  const afterInv = await db.inventory.findUniqueOrThrow({
    where: { variantId_warehouseId: { variantId, warehouseId } },
  });
  assert.equal(before.qtyOnHand - afterInv.qtyOnHand, QTY, "stock was not decremented exactly once");
});
