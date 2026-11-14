import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createReturnRequest, moveReturnRequest, returnableLines, getReturnRequest } from "@/lib/services/admin/returns";
import { listAdminOrders } from "@/lib/services/admin/orders-list";
import { parseOrdersQuery } from "@/lib/admin-orders-query";

/**
 * Return requests: intake against delivered quantities only, review states,
 * audit — and no money, stock or cashback ever moves. Fixtures `ZZZRT<tag>`.
 */
const TAG = `ZZZRT${Date.now() % 1_000_000}`;
let userId = "";
let warehouseId = "";
let productId = "";
let variantId = "";
const ADMIN = randomUUID();

async function orderWith(n: string, ships: { status: string; qty: number }[], status = "delivered") {
  const o = await db.order.create({
    data: {
      orderNo: `${TAG}-${n}`, userId, status: status as never, paymentMethod: "razorpay", subtotalPaise: 5000, totalPaise: 5000, warehouseId,
      placedAt: new Date(Date.now() - 86_400_000), address: { name: "Bilal", phone: "+919800000000" },
      items: { create: { variantId, title: `${TAG} cement`, variantName: "50 kg", unitPricePaise: 500, qty: 10, lineTotalPaise: 5000 } },
      payments: { create: { gateway: "razorpay", amountPaise: 5000, status: "captured" } },
    },
    include: { items: true },
  });
  let seq = 1;
  for (const s of ships) {
    await db.shipment.create({
      data: { orderId: o.id, sequence: seq++, speedClass: "scheduled", status: s.status as never, warehouseId, items: { create: { orderItemId: o.items[0].id, qty: s.qty } } },
    });
  }
  return { orderNo: o.orderNo, id: o.id, itemId: o.items[0].id };
}
const intake = (orderNo: string, itemId: string, qty: number, extra: Partial<Parameters<typeof createReturnRequest>[0]> = {}) =>
  createReturnRequest({ orderNo, items: [{ orderItemId: itemId, qty }], reason: "damaged_in_transit", explanation: "Two bags split on arrival", requestedAt: new Date(Date.now() - 60_000), channel: "Phone call", ...extra }, ADMIN);

before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID() } })).id;
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} W`, city: "Srinagar", pincode: "190001" } })).id;
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  productId = (await db.product.create({ data: { status: "draft", title: `${TAG} p`, slug: `${TAG.toLowerCase()}-p`, categoryId: category.id, brandId: brand.id } })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "50 kg", sku: `${TAG}-SKU`, pricePaise: 500 } })).id;
});

after(async () => {
  const orders = await db.order.findMany({ where: { orderNo: { startsWith: TAG } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  const rr = await db.returnRequest.findMany({ where: { orderId: { in: ids } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityId: { in: rr.map((r) => r.id) } } });
  await db.returnRequest.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.productVariant.deleteMany({ where: { productId } });
  await db.product.delete({ where: { id: productId } });
  await db.warehouse.delete({ where: { id: warehouseId } });
  await db.user.delete({ where: { id: userId } });
});

test("only delivered quantities can be requested; partial delivery limits it", async () => {
  const o = await orderWith("partial", [{ status: "delivered", qty: 4 }, { status: "out_for_delivery", qty: 6 }], "out_for_delivery");
  const lines = await returnableLines(db, o.id);
  assert.deepEqual([lines![0].delivered, lines![0].returnable], [4, 4]);
  const over = await intake(o.orderNo, o.itemId, 5);
  assert.equal(over.ok, false);
  const notDelivered = await orderWith("undelivered", [{ status: "packed", qty: 10 }], "packed");
  assert.equal((await intake(notDelivered.orderNo, notDelivered.itemId, 1)).ok, false);
  const ok = await intake(o.orderNo, o.itemId, 4);
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.value.returnNo, `RET-${o.orderNo}-1`);
});

test("no over-requesting, even by two operators at once; a rejected request frees its quantity", async () => {
  const o = await orderWith("race", [{ status: "delivered", qty: 10 }]);
  const [a, b] = await Promise.all([intake(o.orderNo, o.itemId, 7), intake(o.orderNo, o.itemId, 7)]);
  assert.equal([a, b].filter((r) => r.ok).length, 1, "only one of two 7-bag requests against 10 delivered");
  const winner = (a.ok ? a : b) as { ok: true; value: { returnNo: string } };
  assert.equal((await intake(o.orderNo, o.itemId, 4)).ok, false, "7 + 4 > 10");
  await moveReturnRequest({ returnNo: winner.value.returnNo, to: "rejected", note: "Bags were intact on inspection photo" }, ADMIN);
  assert.equal((await intake(o.orderNo, o.itemId, 10)).ok, true, "rejected quantity is free again");
});

test("review path, decision notes, compare-and-set, and full audit history", async () => {
  const o = await orderWith("flow", [{ status: "delivered", qty: 10 }]);
  const r = await intake(o.orderNo, o.itemId, 2);
  assert.ok(r.ok);
  const no = r.ok ? r.value.returnNo : "";
  assert.equal((await moveReturnRequest({ returnNo: no, to: "approved", note: "" }, ADMIN)).ok, false, "requested cannot jump to approved");
  assert.equal((await moveReturnRequest({ returnNo: no, to: "under_review", note: "" }, ADMIN)).ok, true);
  assert.equal((await moveReturnRequest({ returnNo: no, to: "approved", note: "" }, ADMIN)).ok, false, "a decision needs a reason");
  assert.equal((await moveReturnRequest({ returnNo: no, to: "approved", note: "Photos show split bags" }, ADMIN)).ok, true);
  assert.equal((await moveReturnRequest({ returnNo: no, to: "rejected", note: "changed mind" }, ADMIN)).ok, false, "approved is decided");
  assert.equal((await moveReturnRequest({ returnNo: no, to: "closed", note: "" }, ADMIN)).ok, true);
  const d = await getReturnRequest(no);
  assert.deepEqual(d!.history.map((h) => h.action), ["return.requested", "return.status_changed", "return.status_changed", "return.status_changed"]);
  assert.equal(d!.r.decisionNote, "Photos show split bags");
  assert.ok(d!.r.decidedAt);
  assert.deepEqual(d!.next, []);
});

test("bad intake is refused: empty, future time, before the order, no explanation", async () => {
  const o = await orderWith("bad", [{ status: "delivered", qty: 10 }]);
  assert.equal((await intake(o.orderNo, o.itemId, 0)).ok, false);
  assert.equal((await intake(o.orderNo, o.itemId, 1, { requestedAt: new Date(Date.now() + 3_600_000) })).ok, false);
  assert.equal((await intake(o.orderNo, o.itemId, 1, { requestedAt: new Date("2020-01-01") })).ok, false);
  assert.equal((await intake(o.orderNo, o.itemId, 1, { explanation: "  " })).ok, false);
  assert.equal(await db.returnRequest.count({ where: { order: { orderNo: o.orderNo } } }), 0);
});

test("a request never moves money, stock, cashback or the order; the order shows under Returns, not as cancelled", async () => {
  const o = await orderWith("nomoney", [{ status: "delivered", qty: 10 }]);
  const snap = async () => ({
    payments: await db.payment.findMany({ where: { orderId: o.id }, select: { status: true, amountPaise: true } }),
    order: await db.order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true, totalPaise: true, updatedAt: true } }),
    inventory: (await db.inventory.aggregate({ _sum: { qtyOnHand: true, qtyReserved: true } }))._sum,
    wallet: await db.walletTransaction.count(),
    movements: await db.stockMovement.count(),
  });
  const before = await snap();
  const r = await intake(o.orderNo, o.itemId, 3);
  assert.ok(r.ok);
  const no = r.ok ? r.value.returnNo : "";
  await moveReturnRequest({ returnNo: no, to: "under_review", note: "" }, ADMIN);
  await moveReturnRequest({ returnNo: no, to: "approved", note: "Split bags confirmed" }, ADMIN);
  assert.deepEqual(await snap(), before);
  const list = await listAdminOrders(parseOrdersQuery({ q: o.orderNo, tab: "returns" }));
  assert.deepEqual(list.rows.map((x) => x.orderNo), [o.orderNo]);
  assert.equal(list.counts.cancelled, 0, "a return is not a cancellation");
});
