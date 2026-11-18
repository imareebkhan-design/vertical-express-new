/**
 * B-4 — "Check payment" on an order that is awaiting payment.
 *
 * A customer whose callback was lost, or whose webhook is late, has paid while
 * the console still says "awaiting payment". The button asks Razorpay through
 * the shared lookup (`reconcileWithGateway`). These pin what it may and may not
 * do:
 *
 *   captured at the order's amount  -> confirmed, exactly as a webhook would
 *                                      (status event, captured payment, one
 *                                      confirmation outbox row); stock untouched
 *   nothing captured                -> nothing changes
 *   authorized / lookup failure /
 *   different amount / no keys      -> nothing changes, and the answer says why
 *   not awaiting payment, or no
 *   Razorpay order (COD)            -> Razorpay is not asked at all
 *
 * It never cancels, restocks or marks anything paid by hand. Every press that
 * reaches Razorpay leaves an audit row naming the operator and the answer.
 *
 * Razorpay is replaced by an injected lookup; nothing here calls the network.
 * All rows are created and removed by this file (`ZZZB4…`).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { adminCheckPayment } from "../admin/check-payment";
import { PaymentConfigError, type CapturedLookup } from "../payments";

const USER = randomUUID();
const ADMIN = randomUUID();
const TAG = randomUUID().slice(0, 8);
const STOCK = 40;
const QTY = 2;
const AMOUNT = 20000;
let warehouseId: string;
let variantId: string;
let productId: string;

async function order(opts: { method?: "razorpay" | "cod"; status?: "pending_payment" | "confirmed" | "cancelled" } = {}) {
  const method = opts.method ?? "razorpay";
  const gw = `order_${TAG}_${randomUUID().slice(0, 8)}`;
  const o = await db.order.create({
    data: {
      orderNo: `ZZZB4-${TAG}-${randomUUID().slice(0, 6)}`,
      userId: USER,
      address: { label: "Site", name: "Check Payment Fixture", phone: "+919999999999", line1: "Plot 4", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      status: opts.status ?? "pending_payment",
      paymentMethod: method,
      subtotalPaise: AMOUNT,
      totalPaise: AMOUNT,
      warehouseId,
      items: { create: [{ variantId, title: "Check Payment Fixture", variantName: "Default", unitPricePaise: AMOUNT / QTY, qty: QTY, lineTotalPaise: AMOUNT }] },
      ...(method === "razorpay"
        ? { payments: { create: [{ gateway: "razorpay", amountPaise: AMOUNT, status: "created", gatewayOrderId: gw }] } }
        : {}),
    },
  });
  /* The order holds its stock, as a placed order does. */
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: { decrement: QTY } } });
  return { id: o.id, orderNo: o.orderNo, gw };
}

const stock = async () =>
  (await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } })).qtyOnHand;
const status = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status;
const paymentStatus = async (id: string) => (await db.payment.findFirstOrThrow({ where: { orderId: id } })).status;
const audits = (id: string) => db.auditLog.findMany({ where: { entityId: id, action: "order.payment_checked" } });
const outbox = (id: string) => db.orderEmail.count({ where: { orderId: id } });

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
const captured = (amountPaise = AMOUNT): CapturedLookup => ({
  gatewayPaymentId: `pay_${randomUUID().slice(0, 12)}`,
  amountPaise,
  status: "captured",
});

before(async () => {
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  await db.user.createMany({ data: [{ id: USER }, { id: ADMIN }] });
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ CheckPayment ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  const product = await db.product.create({
    data: {
      slug: `zzz-check-payment-${TAG}`, title: "ZZZ Check Payment Fixture", brandId: brand.id, categoryId: category.id,
      unitLabel: "per bag", status: "published",
      variants: { create: [{ sku: `ZZZ-B4-${TAG}`, name: "Default", pricePaise: AMOUNT / QTY, isDefault: true }] },
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
  await db.orderEmail.deleteMany({ where: { orderId: { in: ids } } });
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

test("paid at Razorpay, not yet confirmed here: the check confirms the order as a webhook would, and keeps its stock", async () => {
  const o = await order();
  const s0 = await stock();
  const l = lookup(captured());

  const r = await adminCheckPayment(ADMIN, o.id, { findCaptured: l.fn });

  assert.equal(r.result, "paid");
  assert.equal(r.orderNo, o.orderNo);
  assert.deepEqual(l.asked, [o.gw], "Razorpay was asked about this order's Razorpay order, once");
  assert.equal(await status(o.id), "confirmed");
  assert.equal(await paymentStatus(o.id), "captured");
  assert.equal(await stock(), s0, "confirming does not move stock");
  const event = await db.orderStatusEvent.findFirstOrThrow({ where: { orderId: o.id, toStatus: "confirmed" } });
  assert.match(event.note ?? "", /an admin pressed Check payment/);
  assert.equal(await outbox(o.id), 1, "the confirmation is queued, as for any other confirmed order");

  const rows = await audits(o.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorId, ADMIN, "the audit row names the operator who pressed it");
  assert.equal(rows[0].actorType, "admin");
  assert.deepEqual(rows[0].after, { result: "paid" });
});

test("pressed again after it confirmed: Razorpay is not asked, nothing is recorded twice", async () => {
  const o = await order();
  await adminCheckPayment(ADMIN, o.id, { findCaptured: lookup(captured()).fn });
  const l = lookup(captured());

  const again = await adminCheckPayment(ADMIN, o.id, { findCaptured: l.fn });

  assert.equal(again.result, "not_pending");
  assert.deepEqual(l.asked, [], "an order no longer awaiting payment is not asked about");
  assert.equal(await db.orderStatusEvent.count({ where: { orderId: o.id, toStatus: "confirmed" } }), 1);
  assert.equal(await outbox(o.id), 1, "one confirmation, not two");
  assert.equal((await audits(o.id)).length, 1, "a press that asked nothing is not an audit event");
});

test("nothing captured: the order stays awaiting payment, its stock stays held, and nothing is cancelled", async () => {
  const o = await order();
  const s0 = await stock();
  const l = lookup(null);

  const r = await adminCheckPayment(ADMIN, o.id, { findCaptured: l.fn });

  assert.equal(r.result, "not_captured");
  assert.deepEqual(l.asked, [o.gw]);
  assert.equal(await status(o.id), "pending_payment");
  assert.equal(await paymentStatus(o.id), "created");
  assert.equal(await stock(), s0, "a check is not a cancel: the stock stays with the order");
  assert.equal(await db.orderStatusEvent.count({ where: { orderId: o.id } }), 0);
  assert.deepEqual((await audits(o.id)).map((a) => a.after), [{ result: "not_captured" }]);
});

test("approved but not captured, Razorpay unreachable, or a different amount: nothing changes, and the answer says which", async () => {
  const cases: [string, CapturedLookup | Error][] = [
    ["in_progress", { gatewayPaymentId: `pay_${randomUUID().slice(0, 8)}`, amountPaise: AMOUNT, status: "authorized" }],
    ["unknown", new Error("RAZORPAY_LOOKUP_FAILED:503")],
    ["unknown", captured(AMOUNT - 100)],
    ["unconfigured", new PaymentConfigError("RAZORPAY_KEY_ID is not set")],
  ];
  for (const [expected, answer] of cases) {
    const o = await order();
    const s0 = await stock();
    const r = await adminCheckPayment(ADMIN, o.id, { findCaptured: lookup(answer).fn });
    assert.equal(r.result, expected, `${expected}: wrong answer`);
    assert.equal(await status(o.id), "pending_payment", `${expected}: the order moved`);
    assert.equal(await paymentStatus(o.id), "created", `${expected}: the payment was marked`);
    assert.equal(await stock(), s0, `${expected}: stock moved`);
    assert.equal(await outbox(o.id), 0, `${expected}: a confirmation was queued`);
    assert.deepEqual((await audits(o.id)).map((a) => a.after), [{ result: expected }]);
  }
});

test("cash on delivery has no Razorpay order: Razorpay is not asked, and no audit row is written", async () => {
  const o = await order({ method: "cod" });
  const l = lookup(captured());
  const r = await adminCheckPayment(ADMIN, o.id, { findCaptured: l.fn });
  assert.equal(r.result, "no_gateway_order");
  assert.deepEqual(l.asked, []);
  assert.equal(await status(o.id), "pending_payment");
  assert.equal((await audits(o.id)).length, 0);
});

test("an order that is not awaiting payment is not asked about, whatever Razorpay would say", async () => {
  for (const s of ["confirmed", "cancelled"] as const) {
    const o = await order({ status: s });
    const l = lookup(captured());
    const r = await adminCheckPayment(ADMIN, o.id, { findCaptured: l.fn });
    assert.equal(r.result, "not_pending", s);
    assert.deepEqual(l.asked, [], `${s}: Razorpay was asked`);
    assert.equal(await status(o.id), s, `${s}: the order moved`);
  }
});

test("an order that does not exist is refused", async () => {
  await assert.rejects(adminCheckPayment(ADMIN, randomUUID(), { findCaptured: lookup(null).fn }), /^Error: NOT_FOUND$/);
});
