import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { findLedgerDrift, recountStock } from "@/lib/services/inventory-movements";

/**
 * A recount records what was found on the shelf, not a difference the
 * operator worked out against a number on their screen.
 *
 * The adjuster took a delta for every reason. For a recount that is two
 * mistakes waiting to happen: the operator subtracts, and the number they
 * subtracted from may already be stale — a sale between counting and pressing
 * Apply meant the delta landed on a count it was never computed against, and
 * the shelf figure they recorded was silently wrong. So a recount takes the
 * counted quantity and the on-hand figure the operator was looking at, and is
 * refused if stock moved in between.
 */
const ACTOR = "zzz-recount@example.invalid";
const TAG = `ZZZRC${Date.now() % 1_000_000}`;
let warehouseId: string;
let productId: string;
let variantId: string;

const onHand = async () =>
  (await db.inventory.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId } } })).qtyOnHand;
const movements = () => db.stockMovement.findMany({ where: { variantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

before(async () => {
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  warehouseId = (await db.warehouse.create({ data: { name: `${TAG} Warehouse`, city: "Srinagar", pincode: "190001" } })).id;
  productId = (await db.product.create({ data: { title: `${TAG} item`, slug: `${TAG.toLowerCase()}-item`, categoryId: category.id, brandId: brand.id } })).id;
  variantId = (await db.productVariant.create({ data: { productId, name: "Unit", sku: `${TAG}-item`, pricePaise: 1000 } })).id;
  /* Stocked with no ledger history, as everything set before the ledger is. */
  await db.inventory.create({ data: { variantId, warehouseId, qtyOnHand: 40 } });
});

after(async () => {
  await db.stockMovement.deleteMany({ where: { variantId } });
  await db.inventory.deleteMany({ where: { variantId } });
  await db.productVariant.deleteMany({ where: { productId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.warehouse.delete({ where: { id: warehouseId } });
});

test("a recount that matches the record writes a zero movement, giving the row its first history", async () => {
  const before = await findLedgerDrift(1000);
  const r = await recountStock({ variantId, warehouseId, countedQty: 40, expectedOnHand: 40, note: "shelf matches", actorEmail: ACTOR });
  assert.deepEqual(r, { ok: true, qtyAfter: 40, qtyDelta: 0 });
  const [m] = await movements();
  assert.equal(m.reason, "recount");
  assert.equal(m.qtyDelta, 0);
  assert.equal(m.qtyAfter, 40);
  assert.equal(m.actorEmail, ACTOR);
  const afterDrift = await findLedgerDrift(1000);
  assert.equal(afterDrift.unledgeredCount, before.unledgeredCount - 1, "the row is no longer without history");
});

test("a recount sets the count to what was found, and the movement is the difference", async () => {
  const r = await recountStock({ variantId, warehouseId, countedQty: 37, expectedOnHand: 40, note: "three bags short", actorEmail: ACTOR });
  assert.deepEqual(r, { ok: true, qtyAfter: 37, qtyDelta: -3 });
  assert.equal(await onHand(), 37);
  const last = (await movements()).at(-1)!;
  assert.equal(last.qtyDelta, -3);
  assert.equal(last.qtyAfter, 37);
});

test("a recount against a count that moved since it was read is refused, and nothing is written", async () => {
  const count = (await movements()).length;
  /* The operator saw 37; a sale took two before they pressed Apply. */
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 35 } });
  const r = await recountStock({ variantId, warehouseId, countedQty: 37, expectedOnHand: 37, note: "recount", actorEmail: ACTOR });
  assert.deepEqual(r, { ok: false, error: "stale", qtyOnHand: 35 });
  assert.equal(await onHand(), 35, "untouched");
  assert.equal((await movements()).length, count, "no movement");
  /* Put the ledger and the shelf back in step for the next test. */
  await db.inventory.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { qtyOnHand: 37 } });
});

test("two operators recounting the same figure at once: one applies, the other is told it moved", async () => {
  const results = await Promise.all([
    recountStock({ variantId, warehouseId, countedQty: 30, expectedOnHand: 37, note: "a", actorEmail: ACTOR }),
    recountStock({ variantId, warehouseId, countedQty: 31, expectedOnHand: 37, note: "b", actorEmail: ACTOR }),
  ]);
  const applied = results.filter((r) => r.ok);
  assert.equal(applied.length, 1, `exactly one recount applies: ${JSON.stringify(results)}`);
  const final = await onHand();
  assert.ok(final === 30 || final === 31);
  const last = (await movements()).at(-1)!;
  assert.equal(last.qtyAfter, final, "the ledger names the count that won");
});

test("a negative or fractional count is refused before anything is read", async () => {
  for (const countedQty of [-1, 2.5]) {
    const r = await recountStock({ variantId, warehouseId, countedQty, expectedOnHand: await onHand(), note: "x", actorEmail: ACTOR });
    assert.deepEqual(r, { ok: false, error: "invalid" });
  }
});

test("a recount where there is no stock record is refused, not created", async () => {
  const other = (await db.warehouse.create({ data: { name: `${TAG} Elsewhere`, city: "Srinagar", pincode: "190002" } })).id;
  try {
    const r = await recountStock({ variantId, warehouseId: other, countedQty: 5, expectedOnHand: 0, note: "x", actorEmail: ACTOR });
    assert.deepEqual(r, { ok: false, error: "not_found" });
    assert.equal(await db.inventory.count({ where: { variantId, warehouseId: other } }), 0);
  } finally {
    await db.warehouse.delete({ where: { id: other } });
  }
});
