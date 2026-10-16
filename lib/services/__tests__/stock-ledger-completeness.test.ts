import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { addItem } from "@/lib/services/cart";
import { placeOrder } from "../checkout";
import { cancelOrder } from "../orders";
import { advanceShipment } from "../admin/shipments-write";
import { adjustStock, findLedgerDrift, listUnresolvedRestocks } from "../inventory-movements";
import { approveTestProductsCreatedSince } from "../../../test-support/catalogue-fixtures";
import { liveTestCityId } from "@/test-support/service-city";

/**
 * Every stock change the order path makes writes a ledger row (ISS-090,
 * "remaining gaps").
 *
 * The checkout decrement and the cancel restock were race-free and
 * transactional but silent: the ledger explained what people did to a count
 * and nothing that orders did to it, so the newest movement's `qtyAfter` went
 * stale after the first sale and the ledger could not be reconciled with the
 * shelf. Each test here checks the invariant that makes the ledger usable —
 * the newest movement's `qtyAfter` equals `qtyOnHand` — not only that a row
 * exists.
 */

const SUITE_START = new Date();
const PINCODE = `98${String(Date.now()).slice(-4)}`;
const STATE = "Jammu & Kashmir";
const TAG = `ZZZLED${Date.now() % 1_000_000}`;
const OPS = { id: randomUUID(), email: "ledger-ops@example.invalid" };
const USERS = [randomUUID(), randomUUID()];
const addressOf: Record<string, string> = {};
let warehouseId: string;
let otherWarehouseId: string;
let productId: string;
let variantId: string;
let savedCod: Awaited<ReturnType<typeof db.setting.findUnique>>;
const savedGateway = process.env.PAYMENT_GATEWAY;

const onHand = async () =>
  (await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } })).qtyOnHand;
const newest = () =>
  db.stockMovement.findFirst({ where: { variantId, warehouseId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
const movementsFor = (orderId: string) =>
  db.stockMovement.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

async function setStock(qty: number) {
  /* Through the ledger, so each test starts from a reconciled count. */
  const delta = qty - (await onHand());
  if (delta !== 0) {
    const r = await adjustStock({ variantId, warehouseId, qtyDelta: delta, reason: "recount", note: "test reset", actorEmail: OPS.email });
    assert.equal(r.ok, true);
  }
}

async function order(userId: string, qty: number) {
  await addItem(userId, null, variantId, qty);
  return placeOrder({ userId, addressId: addressOf[userId], paymentMethod: "cod", idempotencyKey: randomUUID() });
}

before(async () => {
  savedCod = await db.setting.findUnique({ where: { key: "cod.enabled" } });
  await db.setting.upsert({ where: { key: "cod.enabled" }, create: { key: "cod.enabled", value: "true" }, update: { value: "true" } });
  process.env.PAYMENT_GATEWAY = "dummy";
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const category = await db.category.findFirstOrThrow({ where: { isBulk: false }, select: { id: true } });
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} Warehouse`, city: "Srinagar", pincode: "190001" } })).id;
  otherWarehouseId = (await db.warehouse.create({ data: { name: `${TAG} Other`, city: "Srinagar", pincode: "190002" } })).id;
  await db.serviceablePincode.create({
    data: { cityId: await liveTestCityId(), pincode: PINCODE, warehouseId, isActive: true, codAllowed: true, deliveryFeePaise: 4900 },
  });
  for (const id of USERS) {
    await db.user.create({ data: { id } });
    addressOf[id] = (
      await db.address.create({
        data: { userId: id, name: "Ledger Buyer", phone: "9876543210", line1: "Plot 3", city: "Srinagar", state: STATE, pincode: PINCODE, isDefault: true },
      })
    ).id;
  }
  productId = (
    await db.product.create({
      data: { status: "published", title: `${TAG} item`, slug: `${TAG.toLowerCase()}-item`, categoryId: category.id, brandId: brand.id },
    })
  ).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Unit", sku: `${TAG}-item`, pricePaise: 20000, isDefault: true } })).id;
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 0 } });
  await approveTestProductsCreatedSince(SUITE_START);
});

beforeEach(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId: { in: USERS } } } });
});

after(async () => {
  if (savedCod) await db.setting.upsert({ where: { key: savedCod.key }, create: savedCod, update: savedCod });
  else await db.setting.deleteMany({ where: { key: "cod.enabled" } });
  if (savedGateway === undefined) delete process.env.PAYMENT_GATEWAY;
  else process.env.PAYMENT_GATEWAY = savedGateway;
  const where = { order: { userId: { in: USERS } } };
  await db.shipmentItem.deleteMany({ where: { shipment: where } });
  await db.shipment.deleteMany({ where });
  await db.orderItem.deleteMany({ where });
  await db.payment.deleteMany({ where });
  await db.orderStatusEvent.deleteMany({ where });
  await db.auditLog.deleteMany({ where: { actorId: { in: [...USERS, OPS.id] } } });
  const ours = await db.order.findMany({ where: { userId: { in: USERS } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityType: "order", entityId: { in: ours.map((o) => o.id) } } });
  await db.order.deleteMany({ where: { userId: { in: USERS } } });
  await db.cartItem.deleteMany({ where: { cart: { userId: { in: USERS } } } });
  await db.cart.deleteMany({ where: { userId: { in: USERS } } });
  await db.address.deleteMany({ where: { userId: { in: USERS } } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PINCODE } });
  await db.stockMovement.deleteMany({ where: { warehouseId: { in: [warehouseId, otherWarehouseId] } } });
  await db.inventory.deleteMany({ where: { warehouseId: { in: [warehouseId, otherWarehouseId] } } });
  await db.productVariant.deleteMany({ where: { productId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.deleteMany({ where: { id: { in: [warehouseId, otherWarehouseId] } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
});

test("a sale writes a `sold` movement whose qtyAfter is the new count", async () => {
  await setStock(10);
  const placed = await order(USERS[0], 3);
  const o = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });

  const rows = await movementsFor(o.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, "sold");
  assert.equal(rows[0].qtyDelta, -3);
  assert.equal(rows[0].warehouseId, warehouseId);
  assert.equal(rows[0].actorEmail, null, "a sale is the system's, not a person's");
  assert.equal(await onHand(), 7);
  assert.equal((await newest())?.qtyAfter, 7, "the ledger's last word must equal the shelf");
});

test("cancelling releases the stock with a `released` movement, and the order nets to zero", async () => {
  await setStock(10);
  const placed = await order(USERS[0], 4);
  await cancelOrder(USERS[0], placed.orderNo, "changed my mind");
  const o = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });

  const rows = await movementsFor(o.id);
  assert.deepEqual(rows.map((r) => [r.reason, r.qtyDelta]), [["sold", -4], ["released", 4]]);
  assert.equal(rows.reduce((n, r) => n + r.qtyDelta, 0), 0);
  assert.equal(await onHand(), 10);
  assert.equal((await newest())?.qtyAfter, 10);
});

test("a shipment cancel releases once; cancelling the order afterwards releases nothing more", async () => {
  await setStock(10);
  const placed = await order(USERS[0], 2);
  const o = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo }, include: { shipments: true } });
  assert.equal(o.shipments.length, 1);

  assert.equal((await advanceShipment({ shipmentId: o.shipments[0].id, to: "cancelled", actor: OPS })).ok, true);
  await cancelOrder(USERS[0], placed.orderNo, "changed my mind").catch(() => {});

  const rows = await movementsFor(o.id);
  assert.deepEqual(rows.map((r) => [r.reason, r.qtyDelta]), [["sold", -2], ["released", 2]], "released exactly once");
  assert.equal(await onHand(), 10);
  assert.equal((await newest())?.qtyAfter, 10);
});

test("a checkout that fails on stock writes no movement", async () => {
  await setStock(1);
  const before = await db.stockMovement.count({ where: { variantId } });
  await addItem(USERS[0], null, variantId, 1);
  /* Someone else takes the last unit after it went into the cart. */
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 0 } });
  await assert.rejects(placeOrder({ userId: USERS[0], addressId: addressOf[USERS[0]], paymentMethod: "cod", idempotencyKey: randomUUID() }));
  assert.equal(await db.stockMovement.count({ where: { variantId } }), before, "a rolled-back order leaves no ledger row");
  /* Put the count back where the ledger says it is, for the next test. */
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 1 } });
});

test("two customers racing for the last unit: one sale, one ledger row, ledger equals shelf", async () => {
  await setStock(1);
  const before = await db.stockMovement.count({ where: { variantId, reason: "sold" } });
  for (const u of USERS) await addItem(u, null, variantId, 1);
  const results = await Promise.allSettled(
    USERS.map((u) => placeOrder({ userId: u, addressId: addressOf[u], paymentMethod: "cod", idempotencyKey: randomUUID() }))
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.stockMovement.count({ where: { variantId, reason: "sold" } }), before + 1);
  assert.equal(await onHand(), 0);
  assert.equal((await newest())?.qtyAfter, 0);
});

test("replaying the same checkout writes no second movement", async () => {
  await setStock(10);
  await addItem(USERS[1], null, variantId, 2);
  const key = randomUUID();
  const first = await placeOrder({ userId: USERS[1], addressId: addressOf[USERS[1]], paymentMethod: "cod", idempotencyKey: key });
  const again = await placeOrder({ userId: USERS[1], addressId: addressOf[USERS[1]], paymentMethod: "cod", idempotencyKey: key });
  assert.equal(again.orderNo, first.orderNo);
  const o = await db.order.findUniqueOrThrow({ where: { orderNo: first.orderNo } });
  assert.equal((await movementsFor(o.id)).length, 1);
  assert.equal(await onHand(), 8);
});

test("drift: a count changed outside the ledger is listed; stock with no history is only counted", async () => {
  await setStock(10);
  const clean = await findLedgerDrift(1000);
  assert.equal(clean.rows.some((r) => r.variantId === variantId), false, "a reconciled count is not drift");

  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 13 } });
  const drifted = await findLedgerDrift(1000);
  const row = drifted.rows.find((r) => r.variantId === variantId && r.warehouseId === warehouseId);
  assert.ok(row, "an unledgered change must be listed");
  assert.equal(row.qtyOnHand, 13);
  assert.equal(row.ledgerQty, 10);
  assert.equal(drifted.driftCount, clean.driftCount + 1);

  /* A second variant stocked before the ledger existed: no movement at all. */
  const fresh = await db.productVariant.create({ data: { productId, name: "Other", sku: `${TAG}-other`, pricePaise: 20000 } });
  await db.inventory.create({ data: { variantId: fresh.id, warehouseId, qtyOnHand: 5 } });
  const withFresh = await findLedgerDrift(1000);
  assert.equal(withFresh.rows.some((r) => r.variantId === fresh.id), false, "no history is not drift");
  assert.equal(withFresh.unledgeredCount, drifted.unledgeredCount + 1);

  /* findLedgerDrift reads only; nothing it reported was changed. */
  assert.equal(await onHand(), 13);

  /* Adding a variant clears the product's commercial review (a database
     trigger, correctly). Re-record the test approval so later tests can still
     buy it, and put the count back where the ledger says it is. */
  await approveTestProductsCreatedSince(SUITE_START);
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 10 } });
});

/**
 * An order the checkout of today could not have written, cancelled: the
 * restock must not guess where goods go, and must not invent a stock row.
 *
 * Checkout refuses to place an order without a warehouse, and nothing in the
 * app deletes an inventory row, so both cases mean data from before warehouses
 * or a change made outside the app. Putting goods into the wrong warehouse
 * overstates one shelf and lets it be oversold; leaving them out understates
 * it, which a recount fixes and a customer never pays for. So the count is left
 * alone, no movement claims a release that did not happen, and the cancel
 * itself still succeeds.
 */
async function handMadeOrder(suffix: string, qty: number, orderWarehouseId: string | null) {
  return db.order.create({
    data: {
      orderNo: `${TAG}-${suffix}`, userId: USERS[0], status: "confirmed", paymentMethod: "cod",
      address: { label: "site", name: "Legacy", phone: "9876543210", line1: "Plot 3", line2: null, landmark: null, city: "Srinagar", state: STATE, pincode: PINCODE },
      subtotalPaise: 20000 * qty, totalPaise: 20000 * qty, warehouseId: orderWarehouseId,
      items: { create: [{ variantId, title: "Legacy", variantName: "Unit", unitPricePaise: 20000, qty, lineTotalPaise: 20000 * qty }] },
    },
  });
}

test("a legacy order with no warehouse is cancelled without guessing where its stock goes", async () => {
  await setStock(10);
  /* The variant is stocked in two places, so any choice would be a guess. */
  await db.inventory.upsert({
    where: { variantId_warehouseId: { variantId, warehouseId: otherWarehouseId } },
    create: { variantId, warehouseId: otherWarehouseId, qtyOnHand: 4 },
    update: { qtyOnHand: 4 },
  });
  const o = await handMadeOrder("LEGACY", 2, null);
  await cancelOrder(USERS[0], o.orderNo, "changed my mind");

  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "cancelled");
  assert.equal(await onHand(), 10, "the order's own warehouse is unknown — no shelf is credited");
  const other = await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId: otherWarehouseId } } });
  assert.equal(other.qtyOnHand, 4, "not the other warehouse either");
  assert.equal((await movementsFor(o.id)).length, 0, "no movement claims a release that did not happen");
  await assertUnresolved(o.id, o.orderNo, { qty: 2, warehouseId: null, cause: "no_warehouse" });
});

test("a cancel whose stock row is gone creates no row and records no release", async () => {
  /* The order says it came from the other warehouse; the variant has no row there. */
  await db.inventory.deleteMany({ where: { variantId, warehouseId: otherWarehouseId } });
  const o = await handMadeOrder("NOROW", 3, otherWarehouseId);
  await cancelOrder(USERS[0], o.orderNo, "changed my mind");

  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "cancelled");
  assert.equal(await db.inventory.count({ where: { variantId, warehouseId: otherWarehouseId } }), 0, "no stock row is invented");
  assert.equal((await movementsFor(o.id)).length, 0);
  await assertUnresolved(o.id, o.orderNo, { qty: 3, warehouseId: otherWarehouseId, cause: "no_inventory_row" });
});

/**
 * An unresolved restock must outlive the log line: the order is cancelled, a
 * second cancel is refused, so nothing will ever retry it. The record is the
 * only thing that tells an operator these goods are on a shelf the count does
 * not know about.
 */
async function assertUnresolved(
  orderId: string,
  orderNo: string,
  want: { qty: number; warehouseId: string | null; cause: "no_warehouse" | "no_inventory_row" }
) {
  const rows = await db.auditLog.findMany({ where: { entityType: "order", entityId: orderId, action: "inventory.restock_unresolved" } });
  assert.equal(rows.length, 1, "exactly one durable record, written with the cancel");
  const listed = (await listUnresolvedRestocks(100)).find((r) => r.orderId === orderId);
  assert.ok(listed, "the console lists it");
  assert.equal(listed.orderNo, orderNo);
  assert.equal(listed.variantId, variantId);
  assert.equal(listed.sku, `${TAG}-item`);
  assert.equal(listed.qty, want.qty);
  assert.equal(listed.warehouseId, want.warehouseId);
  assert.equal(listed.cause, want.cause);
}

test("a normal cancel leaves no unresolved-restock record", async () => {
  await setStock(10);
  const placed = await order(USERS[0], 1);
  await cancelOrder(USERS[0], placed.orderNo, "changed my mind");
  const o = await db.order.findUniqueOrThrow({ where: { orderNo: placed.orderNo } });
  assert.equal(await db.auditLog.count({ where: { entityId: o.id, action: "inventory.restock_unresolved" } }), 0);
});
