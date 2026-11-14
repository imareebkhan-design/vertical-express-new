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
  cityId: string;
  /** Locality label; null when none. */
  area: string | null;
  /** 0 means no promise. See the note in serviceability-csv.ts. */
  etaMinutes: number;
  deliveryFeePaise: number;
  codAllowed: boolean;
  isActive: boolean;
}

const TRACKED = [
  "cityId",
  "area",
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
        cityId: true,
        area: true,
        warehouseId: true,
        etaMinutes: true,
        deliveryFeePaise: true,
        codAllowed: true,
        isActive: true,
      },
    });

    const after = {
      cityId: edit.cityId,
      area: edit.area,
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
  actorId: string,
  cityId: string
): Promise<{ ok: true; result: BulkResult } | { ok: false; error: string }> {
  const city = await db.serviceCity.findUnique({ where: { id: cityId }, select: { id: true } });
  if (!city) return { ok: false, error: "Pick the city this file is for" };
  /* A file for Delhi must not quietly move a Srinagar pincode into Delhi. */
  const elsewhere = await db.serviceablePincode.findMany({
    where: { pincode: { in: rows.map((r) => r.pincode) }, NOT: { cityId } },
    select: { pincode: true, city: { select: { name: true } } },
  });
  if (elsewhere.length > 0) {
    return {
      ok: false,
      error: `Already in another city: ${elsewhere.map((e) => `${e.pincode} (${e.city.name})`).join(", ")}. Change those one at a time.`,
    };
  }
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
      cityId,
      area: null,
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
          cityId: true,
          area: true,
          warehouseId: true,
          etaMinutes: true,
          deliveryFeePaise: true,
          codAllowed: true,
          isActive: true,
        },
      });

      const after = {
        cityId: edit.cityId,
        area: edit.area,
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
    where: { entityType: { in: ["ServiceablePincode", "ServiceCity"] } },
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

/* ------------------------------------------------------------------------ */
/* Cities                                                                    */
/* ------------------------------------------------------------------------ */

export type AreaResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" | "duplicate" | "invalid"; message: string };

/** A new city starts switched OFF: adding it promises nobody anything yet. */
export async function createCity(
  input: { name: string; state: string },
  actorId: string
): Promise<AreaResult<{ id: string }>> {
  const name = input.name.trim();
  const state = input.state.trim();
  if (name.length < 2 || state.length < 2) return { ok: false, reason: "invalid", message: "Give the city and its state" };
  const clash = await db.serviceCity.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (clash) return { ok: false, reason: "duplicate", message: `${name} already exists` };
  return db.$transaction(async (tx) => {
    const c = await tx.serviceCity.create({ data: { name, state, isLive: false } });
    await recordAudit(tx, {
      actorType: "admin", actorId, action: "service_city.added", entityType: "ServiceCity", entityId: c.id,
      before: null, after: { city: name, state, isLive: false },
    });
    return { ok: true as const, value: { id: c.id } };
  });
}

/**
 * Go live / switch off a whole city. Off keeps every pincode and its terms, so
 * switching back on restores exactly what was there.
 */
export async function setCityLive(cityId: string, isLive: boolean, actorId: string): Promise<AreaResult> {
  return db.$transaction(async (tx) => {
    const c = await tx.serviceCity.findUnique({ where: { id: cityId }, select: { id: true, name: true, isLive: true } });
    if (!c) return { ok: false as const, reason: "not_found" as const, message: "City not found" };
    if (c.isLive === isLive) return { ok: true as const, value: null };
    await tx.serviceCity.update({ where: { id: cityId }, data: { isLive } });
    await recordAudit(tx, {
      actorType: "admin", actorId, action: isLive ? "service_city.live" : "service_city.off",
      entityType: "ServiceCity", entityId: cityId,
      before: { city: c.name, isLive: c.isLive }, after: { city: c.name, isLive },
    });
    return { ok: true as const, value: null };
  });
}

export interface IncludeTerms {
  warehouseId: string;
  etaMinutes: number;
  deliveryFeePaise: number;
  codAllowed: boolean;
  area: string | null;
}

/**
 * Include pincodes in a city with one set of terms. New pincodes are added
 * active; ones already in this city are switched back on with these terms.
 * A pincode that belongs to ANOTHER city is refused, never moved — the whole
 * call is refused, so nothing half-applies.
 */
export async function includePincodes(
  cityId: string,
  pincodes: string[],
  terms: IncludeTerms,
  actorId: string
): Promise<AreaResult<BulkResult & { skippedExcluded: string[] }>> {
  const list = [...new Set(pincodes)];
  if (list.length === 0) return { ok: false, reason: "invalid", message: "Add at least one pincode" };
  const city = await db.serviceCity.findUnique({ where: { id: cityId }, select: { id: true } });
  if (!city) return { ok: false, reason: "not_found", message: "City not found" };
  const wh = await db.warehouse.findUnique({ where: { id: terms.warehouseId }, select: { id: true } });
  if (!wh) return { ok: false, reason: "invalid", message: "Pick a warehouse" };
  const elsewhere = await db.serviceablePincode.findMany({
    where: { pincode: { in: list }, NOT: { cityId } },
    select: { pincode: true, city: { select: { name: true } } },
  });
  if (elsewhere.length > 0) {
    return {
      ok: false, reason: "duplicate",
      message: `Already in another city: ${elsewhere.map((e) => `${e.pincode} (${e.city.name})`).join(", ")}`,
    };
  }
  /* An excluded pincode stays excluded when a range covering it is included
     again: excluding is a deliberate decision about one pincode, and a broad
     range must not quietly undo it. Re-include it with its own button. */
  const excluded = new Set(
    (
      await db.serviceablePincode.findMany({
        where: { pincode: { in: list }, cityId, isActive: false },
        select: { pincode: true },
      })
    ).map((r) => r.pincode)
  );
  const result: BulkResult & { skippedExcluded: string[] } = { created: 0, updated: 0, unchanged: 0, skippedExcluded: [] };
  for (const pincode of list) {
    if (excluded.has(pincode)) {
      result.skippedExcluded.push(pincode);
      continue;
    }
    const r = await savePincode({ pincode, cityId, isActive: true, ...terms }, actorId);
    if (r.created) result.created++;
    else if (r.changed) result.updated++;
    else result.unchanged++;
  }
  return { ok: true, value: result };
}

/** Exclude (or re-include) one pincode without touching its terms. */
export async function setPincodeIncluded(pincode: string, isActive: boolean, actorId: string): Promise<AreaResult> {
  const row = await db.serviceablePincode.findUnique({ where: { pincode } });
  if (!row) return { ok: false, reason: "not_found", message: `${pincode} is not in any city` };
  await savePincode(
    {
      pincode, cityId: row.cityId, area: row.area, warehouseId: row.warehouseId, etaMinutes: row.etaMinutes,
      deliveryFeePaise: row.deliveryFeePaise, codAllowed: row.codAllowed, isActive,
    },
    actorId
  );
  return { ok: true, value: null };
}

/** Every city with its pincodes, for the service-areas screen. */
export async function listServiceAreas() {
  const cities = await db.serviceCity.findMany({
    orderBy: [{ isLive: "desc" }, { name: "asc" }],
    include: {
      pincodes: {
        orderBy: { pincode: "asc" },
        include: { warehouse: { select: { name: true } } },
      },
    },
  });
  return cities.map((c) => ({
    id: c.id,
    name: c.name,
    state: c.state,
    isLive: c.isLive,
    included: c.pincodes.filter((p) => p.isActive).length,
    excluded: c.pincodes.filter((p) => !p.isActive).length,
    pincodes: c.pincodes.map((p) => ({
      pincode: p.pincode,
      area: p.area,
      warehouseId: p.warehouseId,
      warehouseName: p.warehouse.name,
      etaMinutes: p.etaMinutes,
      deliveryFeePaise: p.deliveryFeePaise,
      codAllowed: p.codAllowed,
      isActive: p.isActive,
    })),
  }));
}
