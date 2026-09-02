import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import type { PincodeRow } from "@/lib/serviceability-csv";

/**
 * Changing where we deliver, and on what terms.
 *
 * This table is what checkout consults to decide whether it can take an order
 * at all, what it charges to deliver, and whether cash is offered. Editing it
 * changes what a customer is promised, which is why the screen was read-only
 * with a note saying it needed an audit trail first (ISS-015). The trail exists
 * now, so every write below carries one — in the same transaction, so a change
 * that commits without its audit row is impossible.
 *
 * `before` and `after` hold only the fields that actually moved. A diff of the
 * whole row buries the one number that changed among nine that did not, and the
 * question asked of this log is always "who put the fee up".
 */
export interface PincodeEdit {
  pincode: string;
  warehouseId: string;
  /** 0 means no promise. See the note in serviceability-csv.ts. */
  etaMinutes: number;
  deliveryFeePaise: number;
  codAllowed: boolean;
  isActive: boolean;
}

const TRACKED = [
  "warehouseId",
  "etaMinutes",
  "deliveryFeePaise",
  "codAllowed",
  "isActive",
] as const;

type Tracked = (typeof TRACKED)[number];

/** Only the fields that changed, on both sides. */
function diff(
  before: Record<Tracked, unknown> | null,
  after: Record<Tracked, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  if (!before) return { before: {}, after: { ...after } };
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of TRACKED) {
    if (before[k] !== after[k]) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

export async function savePincode(
  edit: PincodeEdit,
  actorId: string
): Promise<{ created: boolean; changed: boolean }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.serviceablePincode.findUnique({
      where: { pincode: edit.pincode },
      select: {
        id: true,
        warehouseId: true,
        etaMinutes: true,
        deliveryFeePaise: true,
        codAllowed: true,
        isActive: true,
      },
    });

    const after = {
      warehouseId: edit.warehouseId,
      etaMinutes: edit.etaMinutes,
      deliveryFeePaise: edit.deliveryFeePaise,
      codAllowed: edit.codAllowed,
      isActive: edit.isActive,
    };

    const d = diff(existing, after);
    const changed = Object.keys(d.after).length > 0;

    /* Nothing moved. Writing an audit row anyway would fill the log with
       "saved, no change" and bury the entries that matter. */
    if (existing && !changed) return { created: false, changed: false };

    const row = existing
      ? await tx.serviceablePincode.update({ where: { pincode: edit.pincode }, data: after })
      : await tx.serviceablePincode.create({ data: { pincode: edit.pincode, ...after } });

    await recordAudit(tx, {
      actorType: "admin",
      actorId,
      action: existing ? "serviceability.updated" : "serviceability.added",
      entityType: "ServiceablePincode",
      entityId: row.id,
      before: existing ? { pincode: edit.pincode, ...d.before } : null,
      after: { pincode: edit.pincode, ...d.after },
    });

    return { created: !existing, changed: true };
  });
}

export interface BulkResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Apply a whole file, or none of it.
 *
 * One transaction around every row. A courier's coverage change is a single
 * decision, and applying two-thirds of it leaves the map in a state nobody
 * chose — half the district promised delivery and half not, with no record of
 * where the file stopped.
 *
 * Warehouses are resolved by name before anything is written, so an unknown one
 * fails the file rather than half of it.
 */
export async function bulkSavePincodes(
  rows: PincodeRow[],
  actorId: string
): Promise<{ ok: true; result: BulkResult } | { ok: false; error: string }> {
  const warehouses = await db.warehouse.findMany({ select: { id: true, name: true } });
  const byName = new Map(warehouses.map((w) => [w.name.trim().toUpperCase(), w.id]));

  const resolved: PincodeEdit[] = [];
  for (const r of rows) {
    const id = byName.get(r.warehouseCode.trim().toUpperCase());
    if (!id) {
      return {
        ok: false,
        error: `No warehouse named "${r.warehouseCode}" (pincode ${r.pincode}). Known: ${warehouses.map((w) => w.name).join(", ")}`,
      };
    }
    resolved.push({
      pincode: r.pincode,
      warehouseId: id,
      etaMinutes: r.etaMinutes,
      deliveryFeePaise: r.deliveryFeePaise,
      codAllowed: r.codAllowed,
      isActive: r.isActive,
    });
  }

  const result: BulkResult = { created: 0, updated: 0, unchanged: 0 };

  await db.$transaction(async (tx) => {
    for (const edit of resolved) {
      const existing = await tx.serviceablePincode.findUnique({
        where: { pincode: edit.pincode },
        select: {
          id: true,
          warehouseId: true,
          etaMinutes: true,
          deliveryFeePaise: true,
          codAllowed: true,
          isActive: true,
        },
      });

      const after = {
        warehouseId: edit.warehouseId,
        etaMinutes: edit.etaMinutes,
        deliveryFeePaise: edit.deliveryFeePaise,
        codAllowed: edit.codAllowed,
        isActive: edit.isActive,
      };
      const d = diff(existing, after);

      if (existing && Object.keys(d.after).length === 0) {
        result.unchanged++;
        continue;
      }

      const row = existing
        ? await tx.serviceablePincode.update({ where: { pincode: edit.pincode }, data: after })
        : await tx.serviceablePincode.create({ data: { pincode: edit.pincode, ...after } });

      await recordAudit(tx, {
        actorType: "admin",
        actorId,
        action: existing ? "serviceability.bulk_updated" : "serviceability.bulk_added",
        entityType: "ServiceablePincode",
        entityId: row.id,
        before: existing ? { pincode: edit.pincode, ...d.before } : null,
        after: { pincode: edit.pincode, ...d.after },
      });

      if (existing) result.updated++;
      else result.created++;
    }
  });

  return { ok: true, result };
}

/** Recent serviceability changes, for the screen's history panel. */
export async function listServiceabilityAudit(take = 25) {
  return db.auditLog.findMany({
    where: { entityType: "ServiceablePincode" },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      actorId: true,
    },
  });
}
