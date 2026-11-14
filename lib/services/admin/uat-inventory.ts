import "server-only";
import type { Prisma } from "@/prisma/generated/client/client";
import { recordAudit } from "@/lib/services/audit";

export const UAT_OPENING_ACTION = "uat.opening_inventory_initialized";

/** Caller must guard the database target and supply a transaction. A fixed marker
 * per SKU prevents reruns from replenishing stock consumed during acceptance. */
export async function prepareUatInventory(tx: Prisma.TransactionClient, warehouseId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(746502608)`;
  const warehouses = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM warehouses WHERE id = ${warehouseId}::uuid AND is_active FOR SHARE`;
  if (!warehouses.length) throw new Error("An active test warehouse is required");
  const variants = await tx.$queryRaw<{ id: string; sku: string }[]>`
    SELECT id, sku FROM product_variants WHERE is_active ORDER BY id FOR UPDATE`;
  const result = { initialized: [] as string[], alreadyInitialized: [] as string[] };
  for (const variant of variants) {
    const marker = await tx.auditLog.findFirst({
      where: { action: UAT_OPENING_ACTION, entityType: "product_variant", entityId: variant.id },
      select: { id: true },
    });
    if (marker) { result.alreadyInitialized.push(variant.sku); continue; }
    await tx.$queryRaw`SELECT id FROM inventory WHERE variant_id = ${variant.id}::uuid FOR UPDATE`;
    const inventories = await tx.inventory.findMany({ where: { variantId: variant.id } });
    if (inventories.some(i => i.qtyReserved !== 0 || i.qtyOnHand < 0)) {
      throw new Error(`SKU ${variant.sku}: reserved or invalid inventory; finish test orders before initialization`);
    }
    if (inventories.some(i => i.warehouseId !== warehouseId && i.qtyOnHand !== 0)) {
      throw new Error(`SKU ${variant.sku}: stock exists at another warehouse; reconcile test allocation first`);
    }
    const before = inventories.find(i => i.warehouseId === warehouseId)?.qtyOnHand ?? 0;
    await tx.inventory.upsert({
      where: { variantId_warehouseId: { variantId: variant.id, warehouseId } },
      create: { variantId: variant.id, warehouseId, qtyOnHand: 50 },
      update: { qtyOnHand: 50 },
    });
    await tx.stockMovement.create({ data: {
      variantId: variant.id, warehouseId, qtyDelta: 50 - before, qtyAfter: 50,
      reason: "recount", actorEmail: "client-uat@example.invalid",
      note: "CLIENT UAT ONLY: one-time opening stock of 50; not physical inventory",
    } });
    await recordAudit(tx, {
      actorType: "system", action: UAT_OPENING_ACTION, entityType: "product_variant", entityId: variant.id,
      before: { qtyOnHand: before, warehouseId },
      after: { qtyOnHand: 50, warehouseId, testOnly: true, authorization: "Owner client UAT instructions, 8 Nov 2026" },
    });
    result.initialized.push(variant.sku);
  }
  return result;
}
