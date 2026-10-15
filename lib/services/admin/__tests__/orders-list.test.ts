import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { listAdminOrders } from "@/lib/services/admin/orders-list";
import { parseOrdersQuery, PAYMENT_STATES, FULFILMENT_STATES, TABS } from "@/lib/admin-orders-query";
import { fulfilmentState, orderTabs, paymentState } from "@/lib/order-classify";
import { liveTestCityId } from "@/test-support/service-city";

/**
 * The Orders console against real rows. Every tab, payment and fulfilment
 * filter must return exactly the orders the classifier puts there; dates are
 * IST calendar days; search, combined filters, sort and pagination work; and
 * reading the list changes nothing. All fixtures carry `ZZZOL<tag>`.
 */
const TAG = `ZZZOL${Date.now() % 1_000_000}`;
const PIN = "999971";
let userId = "";
let warehouseId = "";
let otherWarehouse = "";
let driverId = "";
let productId = "";
let variantId = "";
let cityId = "";
const fixtures = new Map<string, { status: string; paymentMethod: string; payments: { status: string }[]; shipments: { status: string }[] }>();

async function order(
  n: string,
  o: { status: string; method?: string; pays?: string[]; ships?: string[]; placedAt: string; total?: number; name?: string; phone?: string; wh?: string; driver?: boolean }
) {
  const orderNo = `${TAG}-${n}`;
  const created = await db.order.create({
    data: {
      orderNo, userId, status: o.status as never, paymentMethod: (o.method ?? "razorpay") as never,
      subtotalPaise: o.total ?? 1000, totalPaise: o.total ?? 1000, placedAt: new Date(o.placedAt),
      warehouseId: o.wh ?? warehouseId,
      address: { name: o.name ?? "Bilal", phone: o.phone ?? "+919800000000", line1: "1 Road", city: "Srinagar", pincode: PIN },
      items: { create: [{ variantId, title: `${TAG} cement bag`, variantName: "50 kg", unitPricePaise: 1000, qty: 2, lineTotalPaise: 2000 }] },
      payments: { create: (o.pays ?? []).map((s) => ({ gateway: (o.method ?? "razorpay") as never, amountPaise: 1000, status: s as never })) },
    },
  });
  let seq = 1;
  for (const s of o.ships ?? []) {
    await db.shipment.create({
      data: { orderId: created.id, sequence: seq++, speedClass: "express", status: s as never, warehouseId, ...(o.driver ? { driverId } : {}) },
    });
  }
  fixtures.set(orderNo, { status: o.status, paymentMethod: o.method ?? "razorpay", payments: (o.pays ?? []).map((status) => ({ status })), shipments: (o.ships ?? []).map((status) => ({ status })) });
}

const list = async (raw: Record<string, string>) => {
  const all: string[] = [];
  const first = await listAdminOrders(parseOrdersQuery({ q: TAG, per: "100", ...raw }));
  all.push(...first.rows.map((r) => r.orderNo));
  return { nos: all, res: first };
};
const expected = (pred: (f: ReturnType<typeof fixtures.get> & {}) => boolean) =>
  [...fixtures.entries()].filter(([, f]) => pred(f)).map(([no]) => no).sort();

before(async () => {
  userId = (await db.user.create({ data: { id: randomUUID(), phone: `+9177${Math.floor(10000000 + Math.random() * 89999999)}` } })).id;
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} W1`, city: "Srinagar", pincode: "190001" } })).id;
  otherWarehouse = (await db.warehouse.create({ data: { name: `${TAG} W2`, city: "Srinagar", pincode: "190001" } })).id;
  driverId = (await db.driver.create({ data: { name: `${TAG} Driver`, phone: `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}` } })).id;
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  productId = (await db.product.create({ data: { status: "draft", title: `${TAG} product`, slug: `${TAG.toLowerCase()}-p`, categoryId: category.id, brandId: brand.id } })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "50 kg", sku: `${TAG}-SKU`, pricePaise: 1000 } })).id;
  cityId = await liveTestCityId();
  await db.serviceablePincode.create({ data: { pincode: PIN, cityId, warehouseId, isActive: true } });

  await order("A", { status: "pending_payment", pays: ["created"], ships: ["pending"], placedAt: "2026-10-14T18:29:59Z", total: 1100 });
  await order("B", { status: "confirmed", pays: ["captured"], ships: ["pending"], placedAt: "2026-10-14T18:30:00Z", total: 1200, name: "Zahoor Ahmad", phone: "+91 98111 22333" });
  await order("C", { status: "out_for_delivery", pays: ["captured"], ships: ["delivered", "pending"], placedAt: "2026-10-13T10:00:00Z", total: 9000, driver: true });
  await order("D", { status: "delivered", pays: ["captured"], ships: ["delivered", "delivered"], placedAt: "2026-10-12T10:00:00Z", total: 1300 });
  await order("E", { status: "cancelled", pays: ["created"], ships: ["cancelled"], placedAt: "2026-10-11T10:00:00Z", total: 1400 });
  await order("F", { status: "refunded", pays: ["captured", "refunded"], placedAt: "2026-10-10T10:00:00Z", total: 1500 });
  await order("G", { status: "confirmed", method: "cod", placedAt: "2026-10-09T10:00:00Z", total: 1600, wh: otherWarehouse });
  await order("H", { status: "confirmed", pays: ["failed", "captured"], ships: ["delivered"], placedAt: "2026-10-08T10:00:00Z", total: 1700 });
  await order("I", { status: "packed", pays: ["captured"], ships: ["packed", "packed"], placedAt: "2026-10-07T10:00:00Z", total: 1800 });
  await order("J", { status: "out_for_delivery", method: "cod", ships: ["out_for_delivery", "packed"], placedAt: "2026-10-06T10:00:00Z", total: 1900, driver: true });
  await order("K", { status: "pending_payment", pays: ["failed"], placedAt: "2026-10-05T10:00:00Z", total: 2000 });
});

after(async () => {
  const orders = await db.order.findMany({ where: { orderNo: { startsWith: TAG } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await db.shipment.deleteMany({ where: { orderId: { in: ids } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PIN } });
  await db.productVariant.deleteMany({ where: { productId } });
  await db.product.delete({ where: { id: productId } });
  await db.driver.delete({ where: { id: driverId } });
  await db.warehouse.deleteMany({ where: { id: { in: [warehouseId, otherWarehouse] } } });
  await db.user.delete({ where: { id: userId } });
});

test("every tab returns exactly the orders the classifier puts in it, with matching counts", async () => {
  for (const t of TABS) {
    const { nos, res } = await list({ tab: t.key });
    assert.deepEqual(nos.sort(), expected((f) => orderTabs(f).includes(t.key)), `tab ${t.key}`);
    assert.equal(res.counts[t.key], nos.length, `count for ${t.key}`);
  }
  /* The multi-shipment order is in To pack AND In transit; partially delivered C is not Delivered. */
  assert.ok((await list({ tab: "to_pack" })).nos.includes(`${TAG}-C`));
  assert.ok(!(await list({ tab: "delivered" })).nos.includes(`${TAG}-C`));
  assert.ok((await list({ tab: "delivered" })).nos.includes(`${TAG}-H`), "delivered before the roll-up existed, shown as delivered");
});

test("payment and fulfilment filters equal the classifier, value by value", async () => {
  for (const p of PAYMENT_STATES) {
    assert.deepEqual((await list({ pay: p.key })).nos.sort(), expected((f) => paymentState(f) === p.key), `pay ${p.key}`);
  }
  for (const s of FULFILMENT_STATES) {
    assert.deepEqual((await list({ ful: s.key })).nos.sort(), expected((f) => fulfilmentState(f) === s.key), `ful ${s.key}`);
  }
});

test("OR within a dimension, AND across dimensions", async () => {
  assert.deepEqual((await list({ pay: "cod,failed" })).nos.sort(), [`${TAG}-G`, `${TAG}-J`, `${TAG}-K`]);
  assert.deepEqual((await list({ pay: "paid", ful: "partial" })).nos, [`${TAG}-C`]);
  assert.deepEqual((await list({ method: "cod", tab: "to_dispatch" })).nos, [`${TAG}-J`]);
  assert.deepEqual((await list({ driver: driverId })).nos.sort(), [`${TAG}-C`, `${TAG}-J`]);
  assert.deepEqual((await list({ wh: otherWarehouse })).nos, [`${TAG}-G`]);
  assert.equal((await list({ city: cityId })).nos.length, fixtures.size);
  assert.deepEqual((await list({ st: "packed,refunded" })).nos.sort(), [`${TAG}-F`, `${TAG}-I`]);
});

test("custom date range is IST calendar days with the To date included in full", async () => {
  /* A: 23:59:59 IST on 14 Oct.  B: 00:00:00 IST on 15 Oct. */
  assert.deepEqual((await list({ range: "custom", from: "2026-10-15", to: "2026-10-15" })).nos, [`${TAG}-B`]);
  assert.deepEqual((await list({ range: "custom", from: "2026-10-14", to: "2026-10-14" })).nos, [`${TAG}-A`]);
  assert.deepEqual((await list({ range: "custom", from: "2026-10-12", to: "2026-10-13" })).nos.sort(), [`${TAG}-C`, `${TAG}-D`]);
});

test("search by order number, customer name, mobile digits, product title and SKU", async () => {
  const one = async (q: string) => (await listAdminOrders(parseOrdersQuery({ q, per: "100" }))).rows.map((r) => r.orderNo).filter((n) => n.startsWith(TAG));
  assert.deepEqual(await one(`${TAG}-K`), [`${TAG}-K`]);
  assert.deepEqual(await one("zahoor ahm"), [`${TAG}-B`]);
  assert.deepEqual(await one("98111 22333"), [`${TAG}-B`]);
  assert.equal((await one(`${TAG}-SKU`)).length, fixtures.size);
  assert.equal((await one(`${TAG} cement`)).length, fixtures.size);
  assert.deepEqual(await one("%"), [], "LIKE wildcards are literal");
});

test("sort: newest first by default, amount both ways; times rendered exact", async () => {
  const placed = (await list({})).nos;
  assert.equal(placed[0], `${TAG}-B`);
  assert.equal(placed.at(-1), `${TAG}-K`);
  assert.deepEqual((await list({ sort: "placed_asc" })).nos, [...placed].reverse());
  assert.equal((await list({ sort: "total_desc" })).nos[0], `${TAG}-C`);
  assert.equal((await list({ sort: "total_asc" })).nos[0], `${TAG}-A`);
});

test("pagination is bounded and covers every row exactly once", async () => {
  for (let i = 0; i < 20; i++) {
    await order(`P${String(i).padStart(2, "0")}`, { status: "delivered", pays: ["captured"], ships: ["delivered"], placedAt: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z` });
  }
  const p1 = await listAdminOrders(parseOrdersQuery({ q: TAG }));
  const p2 = await listAdminOrders(parseOrdersQuery({ q: TAG, page: "2" }));
  assert.equal(p1.rows.length, 25);
  assert.equal(p1.pages, 2);
  assert.equal(p2.rows.length, fixtures.size - 25);
  const seen = [...p1.rows, ...p2.rows].map((r) => r.orderNo);
  assert.equal(new Set(seen).size, fixtures.size, "no row repeated or skipped across pages");
});

test("reading the list changes nothing: no payment, stock, wallet or order writes", async () => {
  const snap = async () => ({
    payments: await db.payment.count(),
    captured: await db.payment.count({ where: { status: "captured" } }),
    inventory: (await db.inventory.aggregate({ _sum: { qtyOnHand: true, qtyReserved: true } }))._sum,
    wallet: await db.walletTransaction.count(),
    updated: (await db.order.aggregate({ _max: { updatedAt: true } }))._max.updatedAt?.getTime(),
    events: await db.orderStatusEvent.count(),
  });
  const before = await snap();
  for (const t of TABS) await list({ tab: t.key, pay: "paid,cod", sort: "updated_desc" });
  assert.deepEqual(await snap(), before);
});
