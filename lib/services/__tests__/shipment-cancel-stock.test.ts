import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { cancelOrder, cleanupExpiredPendingOrders } from "../orders";
import { advanceOrderStatus } from "../admin/manage";
import { advanceShipment } from "../admin/shipments-write";

/**
 * Cancelling returns each unit of stock exactly once, to the warehouse it came
 * from, and never returns goods that have left the warehouse (ISS-090).
 *
 * A shipment cancel ran `releaseOrderInventory` for the WHOLE order, so
 * cancelling the express half of a mixed order put the truck half's goods back
 * too, and cancelling the order afterwards put everything back again. An order
 * cancel also restocked goods already on a vehicle. All of it is stock that
 * does not exist — the next customer is sold it.
 *
 * Every test checks every inventory row in both warehouses, not only the one
 * expected to move: a release into the wrong place is the defect.
 */

const USER = randomUUID();
const ADMIN = randomUUID();
const OPS = { id: ADMIN, email: "ops@test" };
const TAG = `SCS${Date.now() % 1_000_000}`;
const ADDRESS = { label: "site", name: "Ship Cancel Stock", phone: "9876543210", line1: "Plot 1", line2: null, landmark: null, city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" };
let productId: string;
const wh = { main: "", other: "" };
const v = { light: "", heavy: "" };
const LIGHT = 3;
const HEAVY = 5;

type Stock = Record<string, number>;
async function stock(): Promise<Stock> {
  const rows = await db.inventory.findMany({ where: { variantId: { in: [v.light, v.heavy] } } });
  const out: Stock = {};
  for (const r of rows) out[`${r.variantId === v.light ? "light" : "heavy"}@${r.warehouseId === wh.main ? "main" : "other"}`] = r.qtyOnHand;
  return out;
}
/** `before` plus the expected changes, everything else unchanged. */
const plus = (before: Stock, delta: Partial<Stock>): Stock =>
  Object.fromEntries(Object.entries(before).map(([k, n]) => [k, n + (delta[k] ?? 0)]));

/**
 * An order of 3 light + 5 heavy taken from `warehouse` (the checkout decrement
 * is applied here too, so the totals are real), split into an express and a
 * truck shipment, exactly as checkout writes it.
 */
async function mixedOrder(
  suffix: string,
  opts: { status?: "confirmed" | "pending_payment"; paymentMethod?: "cod" | "razorpay"; placedAt?: Date; warehouse?: "main" | "other" } = {}
) {
  const warehouseId = wh[opts.warehouse ?? "main"];
  for (const [variantId, qty] of [[v.light, LIGHT], [v.heavy, HEAVY]] as const) {
    await db.inventory.updateMany({ where: { variantId, warehouseId }, data: { qtyOnHand: { decrement: qty } } });
  }
  const order = await db.order.create({
    data: {
      orderNo: `${TAG}-${suffix}`, userId: USER, address: ADDRESS, status: opts.status ?? "confirmed",
      paymentMethod: opts.paymentMethod ?? "cod", subtotalPaise: 8000, totalPaise: 8000, warehouseId,
      ...(opts.placedAt ? { placedAt: opts.placedAt } : {}),
      items: {
        create: [
          { variantId: v.light, title: "Light", variantName: "Unit", unitPricePaise: 1000, qty: LIGHT, lineTotalPaise: 3000 },
          { variantId: v.heavy, title: "Heavy", variantName: "Bag", unitPricePaise: 1000, qty: HEAVY, lineTotalPaise: 5000 },
        ],
      },
    },
    include: { items: true },
  });
  const line = (variantId: string) => order.items.find((i) => i.variantId === variantId)!;
  const express = await db.shipment.create({
    data: { orderId: order.id, sequence: 1, speedClass: "express", warehouseId,
      items: { create: [{ orderItemId: line(v.light).id, qty: LIGHT }] } },
  });
  const truck = await db.shipment.create({
    data: { orderId: order.id, sequence: 2, speedClass: "scheduled", warehouseId,
      items: { create: [{ orderItemId: line(v.heavy).id, qty: HEAVY }] } },
  });
  return { order, express, truck };
}
const shipStatus = async (id: string) => (await db.shipment.findUniqueOrThrow({ where: { id } })).status;
const orderStatus = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id } })).status;
/** Dispatch without a driver fixture: the state the dispatch board leaves behind. */
const dispatch = (id: string) => db.shipment.update({ where: { id }, data: { status: "out_for_delivery", dispatchedAt: new Date() } });

before(async () => {
  const category = await db.category.findFirst({ select: { id: true } });
  const brand = await db.brand.findFirst({ select: { id: true } });
  if (!category || !brand) throw new Error("Seed must provide a category and a brand.");
  await db.user.createMany({ data: [
    { id: USER, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
    { id: ADMIN, phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}` },
  ] });
  wh.main = (await db.warehouse.create({ data: { name: `Ship Cancel Main ${TAG}`, city: "Srinagar", pincode: "190001" } })).id;
  wh.other = (await db.warehouse.create({ data: { name: `Ship Cancel Other ${TAG}`, city: "Srinagar", pincode: "190002" } })).id;
  productId = (await db.product.create({
    data: { title: "Ship Cancel Item", slug: `ship-cancel-${TAG.toLowerCase()}`, categoryId: category.id, brandId: brand.id },
  })).id;
  for (const k of ["light", "heavy"] as const) {
    const variant = await db.productVariant.create({ data: { productId, name: k, sku: `SKU-${TAG}-${k}`, pricePaise: 1000 } });
    v[k] = variant.id;
    await db.inventory.create({ data: { variantId: variant.id, warehouseId: wh.main, qtyOnHand: 100 } });
    await db.inventory.create({ data: { variantId: variant.id, warehouseId: wh.other, qtyOnHand: 100 } });
  }
});

after(async () => {
  await db.auditLog.deleteMany({ where: { actorId: ADMIN } });
  await db.orderStatusEvent.deleteMany({ where: { order: { userId: USER } } });
  await db.order.deleteMany({ where: { userId: USER } });
  await db.inventory.deleteMany({ where: { warehouseId: { in: [wh.main, wh.other] } } });
  await db.productVariant.deleteMany({ where: { productId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: { in: [wh.main, wh.other] } } });
  await db.user.deleteMany({ where: { id: { in: [USER, ADMIN] } } });
});

test("a full order cancel returns everything once and closes both shipments", async () => {
  const before = await stock();
  const { order, express, truck } = await mixedOrder("FULL");
  await cancelOrder(USER, order.orderNo, "changed my mind");
  assert.deepEqual(await stock(), before, "totals back exactly where they were before the order");
  assert.equal(await shipStatus(express.id), "cancelled");
  assert.equal(await shipStatus(truck.id), "cancelled");
});

test("cancelling one shipment restocks only what it carries", async () => {
  const { express, truck } = await mixedOrder("ONE");
  const before = await stock();
  const res = await advanceShipment({ shipmentId: express.id, to: "cancelled", actor: OPS });
  assert.equal(res.ok, true);
  assert.deepEqual(await stock(), plus(before, { "light@main": LIGHT }), "the truck's goods were never on the bike");
  assert.equal(await shipStatus(truck.id), "pending", "the other shipment is still work");
});

test("a shipment cancel then the order cancel: each unit back once", async () => {
  const before = await stock();
  const { order, express, truck } = await mixedOrder("THEN-ORDER");
  assert.equal((await advanceShipment({ shipmentId: express.id, to: "cancelled", actor: OPS })).ok, true);
  await advanceOrderStatus(ADMIN, order.id, "cancelled");
  assert.deepEqual(await stock(), before);
  assert.equal(await shipStatus(truck.id), "cancelled");
});

test("repeated cancels change nothing the second time", async () => {
  const before = await stock();
  const { order, express } = await mixedOrder("REPEAT");
  assert.equal((await advanceShipment({ shipmentId: express.id, to: "cancelled", actor: OPS })).ok, true);
  const again = await advanceShipment({ shipmentId: express.id, to: "cancelled", actor: OPS });
  assert.equal(again.ok, false, "a cancelled shipment cannot be cancelled again");
  await cancelOrder(USER, order.orderNo, "first");
  await assert.rejects(cancelOrder(USER, order.orderNo, "retry"), /NOT_CANCELLABLE/);
  await assert.rejects(advanceOrderStatus(ADMIN, order.id, "cancelled"));
  assert.deepEqual(await stock(), before);
});

test("a shipment cancel and an order cancel at the same moment: each unit back once", async () => {
  /* Several rounds, because a race that loses once in five is still a race. */
  for (let i = 0; i < 5; i++) {
    const before = await stock();
    const { order, express, truck } = await mixedOrder(`RACE-${i}`);
    await Promise.allSettled([
      advanceShipment({ shipmentId: express.id, to: "cancelled", actor: OPS }),
      advanceOrderStatus(ADMIN, order.id, "cancelled"),
    ]);
    assert.equal(await orderStatus(order.id), "cancelled", `round ${i}: the order cancel always lands`);
    assert.equal(await shipStatus(express.id), "cancelled", `round ${i}`);
    assert.equal(await shipStatus(truck.id), "cancelled", `round ${i}`);
    assert.deepEqual(await stock(), before, `round ${i}: no unit released twice, none kept`);
  }
});

test("two order cancels at the same moment: one wins, stock back once", async () => {
  const before = await stock();
  const { order } = await mixedOrder("DOUBLE");
  const results = await Promise.allSettled([
    advanceOrderStatus(ADMIN, order.id, "cancelled"),
    cancelOrder(USER, order.orderNo, "same moment"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await stock(), before);
});

test("an expired unpaid order returns its stock once and closes its shipments", async () => {
  const before = await stock();
  const { order, express, truck } = await mixedOrder("EXPIRED", {
    status: "pending_payment", paymentMethod: "razorpay", placedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  });
  await cleanupExpiredPendingOrders(2 * 24 * 60);
  assert.equal(await orderStatus(order.id), "cancelled");
  assert.equal(await shipStatus(express.id), "cancelled");
  assert.equal(await shipStatus(truck.id), "cancelled");
  assert.deepEqual(await stock(), before);
  await cleanupExpiredPendingOrders(2 * 24 * 60);
  assert.deepEqual(await stock(), before, "a second cron run changes nothing");
});

test("stock goes back to the warehouse it came from", async () => {
  const before = await stock();
  const { order, express } = await mixedOrder("OTHER-WH", { warehouse: "other" });
  assert.equal((await advanceShipment({ shipmentId: express.id, to: "cancelled", actor: OPS })).ok, true);
  assert.deepEqual(await stock(), plus(before, { "heavy@other": -HEAVY }), "light back at OTHER; main untouched");
  await advanceOrderStatus(ADMIN, order.id, "cancelled");
  assert.deepEqual(await stock(), before);
});

test("an order with goods on the road cannot be cancelled, and nothing is restocked", async () => {
  const { order, express, truck } = await mixedOrder("ON-ROAD");
  await dispatch(express.id);
  const before = await stock();
  await assert.rejects(advanceOrderStatus(ADMIN, order.id, "cancelled"), /SHIPMENT_DISPATCHED/);
  await assert.rejects(cancelOrder(USER, order.orderNo, "too late"), /NOT_CANCELLABLE/);
  assert.equal(await orderStatus(order.id), "confirmed", "the refused cancel rolled back");
  assert.equal(await shipStatus(truck.id), "pending", "and left the other shipment alone");
  assert.deepEqual(await stock(), before);
});

test("a failed delivery brought back restocks that shipment once (the supported return)", async () => {
  const { express } = await mixedOrder("RETURNED");
  await dispatch(express.id);
  const before = await stock();
  assert.equal((await advanceShipment({ shipmentId: express.id, to: "cancelled", actor: OPS })).ok, true);
  assert.deepEqual(await stock(), plus(before, { "light@main": LIGHT }));
});
