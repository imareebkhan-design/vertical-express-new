/**
 * An admin cancelling a pending online order asks Razorpay first.
 *
 * The customer's cancel and the expiry job both check the gateway before
 * cancelling an order that is "awaiting payment"; the admin status change did
 * not. An order the customer had paid for — callback lost, webhook late — could
 * be cancelled and restocked from the console. These pin the same rule here:
 * cancel only on a definite "nothing captured".
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { advanceOrderStatus } from "../admin/manage";
import type { CapturedLookup } from "../payments";

const USER = randomUUID();
const ADMIN = randomUUID();
const TAG = randomUUID().slice(0, 8);
const STOCK = 40;
const QTY = 2;
const AMOUNT = 20000;
let warehouseId: string;
let variantId: string;
let productId: string;

async function pendingOrder(method: "razorpay" | "cod" = "razorpay") {
  const gw = `order_${TAG}_${randomUUID().slice(0, 8)}`;
  const order = await db.order.create({
    data: {
      orderNo: `ZZZADM-${TAG}-${randomUUID().slice(0, 6)}`,
      userId: USER,
      address: { label: "Site", name: "Admin Cancel Fixture", phone: "+919999999999", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: "pending_payment",
      paymentMethod: method,
      subtotalPaise: AMOUNT,
      totalPaise: AMOUNT,
      warehouseId,
      items: { create: [{ variantId, title: "Admin Cancel Fixture", variantName: "Default", unitPricePaise: AMOUNT / QTY, qty: QTY, lineTotalPaise: AMOUNT }] },
      ...(method === "razorpay"
        ? { payments: { create: [{ gateway: "razorpay", amountPaise: AMOUNT, status: "created", gatewayOrderId: gw }] } }
        : {}),
    },
  });
  /* The order holds its stock, as a placed order does. */
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: { decrement: QTY } } });
  return { id: order.id, gw };
}

const stock = async () =>
  (await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } })).qtyOnHand;
const status = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status;

function lookup(answer: CapturedLookup | null | Error) {
  const asked: string[] = [];
  return {
    asked,
    fn: async (gw: string) => {
      asked.push(gw);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  await db.user.createMany({ data: [{ id: USER }, { id: ADMIN }] });
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ AdminCancel ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  const product = await db.product.create({
    data: {
      slug: `zzz-admin-cancel-${TAG}`, title: "ZZZ Admin Cancel Fixture", brandId: brand.id, categoryId: category.id,
      unitLabel: "per bag", status: "published",
      variants: { create: [{ sku: `ZZZ-ADM-${TAG}`, name: "Default", pricePaise: AMOUNT / QTY, isDefault: true }] },
    },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0].id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: STOCK } });
});

after(async () => {
  const ids = (await db.order.findMany({ where: { userId: USER }, select: { id: true } })).map((o) => o.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.orderStatusEvent.deleteMany({ where: { orderId: { in: ids } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.stockMovement.deleteMany({ where: { variantId } }).catch(() => {});
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { id: variantId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: { in: [USER, ADMIN] } } });
});

test("paid at Razorpay but not yet confirmed here: the admin cancel is refused, the order is confirmed and keeps its stock", async () => {
  const o = await pendingOrder();
  const s0 = await stock();
  const pay = `pay_${randomUUID().slice(0, 12)}`;
  const l = lookup({ gatewayPaymentId: pay, amountPaise: AMOUNT, status: "captured" });

  await assert.rejects(advanceOrderStatus(ADMIN, o.id, "cancelled", { findCaptured: l.fn }), /^Error: PAYMENT_FOUND$/);

  assert.deepEqual(l.asked, [o.gw], "Razorpay was asked about this order's Razorpay order");
  assert.equal(await status(o.id), "confirmed");
  assert.equal((await db.payment.findFirstOrThrow({ where: { orderId: o.id } })).status, "captured");
  assert.equal(await stock(), s0, "stock of a paid order is not released");
  const note = (await db.orderStatusEvent.findFirstOrThrow({ where: { orderId: o.id, toStatus: "confirmed" } })).note;
  assert.match(note ?? "", /an admin went to cancel/);
});

test("authorized, lookup failure or a different amount: refused, nothing moves", async () => {
  const cases: [RegExp, ReturnType<typeof lookup>][] = [
    [/^Error: PAYMENT_IN_PROGRESS$/, lookup({ gatewayPaymentId: `pay_${randomUUID().slice(0, 8)}`, amountPaise: AMOUNT, status: "authorized" })],
    [/^Error: PAYMENT_STATUS_UNKNOWN$/, lookup(new Error("RAZORPAY_LOOKUP_FAILED:503"))],
    [/^Error: PAYMENT_STATUS_UNKNOWN$/, lookup({ gatewayPaymentId: `pay_${randomUUID().slice(0, 8)}`, amountPaise: AMOUNT - 100, status: "captured" })],
  ];
  for (const [expected, l] of cases) {
    const o = await pendingOrder();
    const s0 = await stock();
    await assert.rejects(advanceOrderStatus(ADMIN, o.id, "cancelled", { findCaptured: l.fn }), expected);
    assert.equal(await status(o.id), "pending_payment");
    assert.equal(await stock(), s0);
  }
});

test("nothing captured: the admin cancel goes through and restocks once", async () => {
  const o = await pendingOrder();
  const s0 = await stock();
  const l = lookup(null);
  await advanceOrderStatus(ADMIN, o.id, "cancelled", { findCaptured: l.fn });
  assert.deepEqual(l.asked, [o.gw]);
  assert.equal(await status(o.id), "cancelled");
  assert.equal(await stock(), s0 + QTY);
});

test("an order with no Razorpay order (cash on delivery) is cancelled without asking", async () => {
  const o = await pendingOrder("cod");
  const l = lookup(new Error("must not be called"));
  await advanceOrderStatus(ADMIN, o.id, "cancelled", { findCaptured: l.fn });
  assert.deepEqual(l.asked, []);
  assert.equal(await status(o.id), "cancelled");
});
