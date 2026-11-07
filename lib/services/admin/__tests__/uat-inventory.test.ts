import assert from "node:assert/strict";
import test from "node:test";
import { db } from "@/lib/db";
import { prepareUatInventory, UAT_OPENING_ACTION } from "@/lib/services/admin/uat-inventory";

test("UAT stock initializes to 50 once and does not replenish consumed stock", async () => {
  const rollback = new Error("rollback test");
  await assert.rejects(db.$transaction(async tx => {
    const w = await tx.warehouse.findFirstOrThrow({ where: { isActive: true } });
    const first = await prepareUatInventory(tx, w.id);
    assert.ok(first.initialized.length > 0);
    const v = await tx.productVariant.findUniqueOrThrow({ where: { sku: first.initialized[0] } });
    const key = { variantId_warehouseId: { variantId: v.id, warehouseId: w.id } };
    assert.equal((await tx.inventory.findUniqueOrThrow({ where: key })).qtyOnHand, 50);
    await tx.inventory.update({ where: key, data: { qtyOnHand: 48 } });
    const again = await prepareUatInventory(tx, w.id);
    assert.equal(again.initialized.length, 0);
    assert.equal((await tx.inventory.findUniqueOrThrow({ where: key })).qtyOnHand, 48);
    assert.equal(await tx.auditLog.count({ where: { action: UAT_OPENING_ACTION, entityId: v.id } }), 1);
    throw rollback;
  }, { timeout: 60_000 }), e => e === rollback);
});

test("UAT setup refuses reserved stock and rolls back its whole transaction", async () => {
  const w = await db.warehouse.findFirstOrThrow({ where: { isActive: true } });
  const v = await db.productVariant.findFirstOrThrow({ where: { isActive: true } });
  const before = await db.inventory.findUnique({ where: { variantId_warehouseId: { variantId: v.id, warehouseId: w.id } } });
  await assert.rejects(db.$transaction(async tx => {
    await tx.inventory.upsert({
      where: { variantId_warehouseId: { variantId: v.id, warehouseId: w.id } },
      create: { variantId: v.id, warehouseId: w.id, qtyOnHand: 20, qtyReserved: 1 },
      update: { qtyOnHand: 20, qtyReserved: 1 },
    });
    await prepareUatInventory(tx, w.id);
  }, { timeout: 60_000 }), /reserved or invalid inventory/);
  assert.deepEqual(await db.inventory.findUnique({ where: { variantId_warehouseId: { variantId: v.id, warehouseId: w.id } } }), before);
  assert.equal(await db.auditLog.count({ where: { action: UAT_OPENING_ACTION } }), 0);
});

test("UAT setup refuses an unknown warehouse without leaving audit markers", async () => {
  await assert.rejects(db.$transaction(tx => prepareUatInventory(tx, "ffffffff-ffff-4fff-8fff-ffffffffffff")), /active test warehouse/);
  assert.equal(await db.auditLog.count({ where: { action: UAT_OPENING_ACTION } }), 0);
});
