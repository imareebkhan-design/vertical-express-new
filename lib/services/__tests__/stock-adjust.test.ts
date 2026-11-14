import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustStock, listStockMovements } from "@/lib/services/inventory-movements";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@/lib/db";

/**
 * Stock adjustment: the numbers must be right even when two people count the
 * same shelf at once, and every change must leave a readable reason.
 *
 * The order path already decremented stock race-free and transactionally, but
 * it left no trace. This is the other half — a person changing a count — and it
 * has the same two obligations plus one more: the movement row and the new
 * quantity must agree, always. A ledger that disagrees with the shelf is worse
 * than no ledger, because people trust it.
 */
const ACTOR = "zzz-test@example.invalid";

async function pick() {
  const inv = await db.inventory.findFirst({
    where: { qtyOnHand: { gte: 5 } },
    select: { variantId: true, warehouseId: true, qtyOnHand: true },
  });
  assert.ok(inv, "no stocked inventory row to test against");
  return inv;
}

async function cleanup(variantId: string) {
  await db.stockMovement.deleteMany({ where: { actorEmail: ACTOR, variantId } });
}

test("an adjustment moves the count and records why", async (t) => {
  const inv = await pick();
  t.after(async () => {
    await cleanup(inv.variantId);
    await db.inventory.update({
      where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
      data: { qtyOnHand: inv.qtyOnHand },
    });
  });

  const r = await adjustStock({
    variantId: inv.variantId,
    warehouseId: inv.warehouseId,
    qtyDelta: 7,
    reason: "received",
    note: "two pallets",
    actorEmail: ACTOR,
  });

  assert.ok(r.ok, "a valid adjustment was rejected");
  assert.equal(r.qtyAfter, inv.qtyOnHand + 7);

  const after = await db.inventory.findUnique({
    where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
    select: { qtyOnHand: true },
  });
  assert.equal(after?.qtyOnHand, inv.qtyOnHand + 7, "the stored count does not match the result");

  const [move] = await db.stockMovement.findMany({
    where: { actorEmail: ACTOR, variantId: inv.variantId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  assert.ok(move, "the adjustment left no movement row");
  assert.equal(move.qtyDelta, 7);
  assert.equal(move.qtyAfter, inv.qtyOnHand + 7, "the ledger disagrees with the shelf");
  assert.equal(move.reason, "received");
  assert.equal(move.note, "two pallets");
});

test("stock cannot be driven below zero", async (t) => {
  const inv = await pick();
  t.after(() => cleanup(inv.variantId));

  const r = await adjustStock({
    variantId: inv.variantId,
    warehouseId: inv.warehouseId,
    qtyDelta: -(inv.qtyOnHand + 1),
    reason: "damaged",
    actorEmail: ACTOR,
  });

  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "would_go_negative");

  const after = await db.inventory.findUnique({
    where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
    select: { qtyOnHand: true },
  });
  assert.equal(after?.qtyOnHand, inv.qtyOnHand, "a rejected adjustment still moved the count");

  const moves = await db.stockMovement.count({
    where: { actorEmail: ACTOR, variantId: inv.variantId },
  });
  assert.equal(moves, 0, "a rejected adjustment wrote a movement row anyway");
});

test("a write computed against a stale count is refused", async (t) => {
  /* THE GUARD, PROVED DETERMINISTICALLY.
   *
   * My first attempt at this ran two adjustStock calls through Promise.all and
   * asserted an invariant. It passed with the guard REMOVED — the two
   * transactions did not interleave the way I assumed, so it proved nothing.
   * A concurrency test that cannot fail is worse than none: it is a green tick
   * over the exact bug it claims to cover.
   *
   * So the stale read is staged instead of hoped for. Somebody else moves the
   * count between our read and our write; the guarded update must then match
   * zero rows rather than overwriting with a number computed from a count that
   * no longer exists. */
  const inv = await pick();
  t.after(() =>
    db.inventory.update({
      where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
      data: { qtyOnHand: inv.qtyOnHand },
    })
  );

  const staleRead = inv.qtyOnHand;

  // Somebody else counts the same shelf and commits first.
  await db.inventory.update({
    where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
    data: { qtyOnHand: staleRead + 10 },
  });

  // Our write, still carrying the number we read before that happened.
  const applied = await db.inventory.updateMany({
    where: { variantId: inv.variantId, warehouseId: inv.warehouseId, qtyOnHand: staleRead },
    data: { qtyOnHand: staleRead + 3 },
  });

  assert.equal(applied.count, 0, "a stale write was applied over somebody else's count");

  const after = await db.inventory.findUnique({
    where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
    select: { qtyOnHand: true },
  });
  assert.equal(after?.qtyOnHand, staleRead + 10, "the other person's count was lost");
});

test("adjustStock actually uses that guard", () => {
  /* The test above proves the mechanism works. This proves the service uses
     it — otherwise the two could drift apart and the proof would be of
     something nothing calls. */
  const src = readFileSync(
    join(fileURLToPath(new URL("../../../", import.meta.url)), "lib/services/inventory-movements.ts"),
    "utf8"
  );
  assert.match(
    src,
    /updateMany\(\{[\s\S]{0,200}qtyOnHand:\s*row\.qtyOnHand/,
    "adjustStock no longer conditions its update on the count it read"
  );
  assert.match(src, /applied\.count !== 1/, "the guard's result is no longer checked");
});

test("a missing stock record is refused, not created", async () => {
  const wh = await db.warehouse.findFirst({ select: { id: true } });
  assert.ok(wh);
  const orphan = await db.productVariant.findFirst({
    where: { inventory: { none: {} } },
    select: { id: true },
  });
  if (!orphan) return; // every variant is stocked here; nothing to prove

  const r = await adjustStock({
    variantId: orphan.id,
    warehouseId: wh.id,
    qtyDelta: 5,
    reason: "received",
    actorEmail: ACTOR,
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "not_found");
});

test("the ledger reads newest first", async (t) => {
  const inv = await pick();
  t.after(async () => {
    await cleanup(inv.variantId);
    await db.inventory.update({
      where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
      data: { qtyOnHand: inv.qtyOnHand },
    });
  });

  await adjustStock({ variantId: inv.variantId, warehouseId: inv.warehouseId, qtyDelta: 1, reason: "recount", note: "first", actorEmail: ACTOR });
  await adjustStock({ variantId: inv.variantId, warehouseId: inv.warehouseId, qtyDelta: 1, reason: "recount", note: "second", actorEmail: ACTOR });

  const { rows } = await listStockMovements(1, 50);
  const mine = rows.filter((r) => r.actorEmail === ACTOR);
  assert.ok(mine.length >= 2);
  assert.equal(mine[0].note, "second", "the ledger is not newest-first");
  for (let i = 1; i < mine.length; i++) {
    assert.ok(mine[i - 1].createdAt >= mine[i].createdAt);
  }
});
