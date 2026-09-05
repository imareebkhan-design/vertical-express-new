import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";

/**
 * Creating and retiring the people and vehicles that carry goods.
 *
 * The dispatch board could assign a driver from the moment `Driver` landed, and
 * there was no way to create one — the roster was empty and seedable only by
 * hand, so on a fresh database the board offered a dropdown with nothing in it
 * and a Dispatch button that would always refuse. This is the missing half.
 *
 * **Nobody is ever deleted.** A driver who carried shipments is referenced by
 * every one of them, and removing the row would turn a delivered order into one
 * that nobody took. Retiring sets `isActive` false: they stop appearing in the
 * dropdown and `assignShipment` refuses them, while the history stays readable.
 * Same reasoning the coupon screen already applies — "orders reference the code
 * as a string, and removing it turns every order that used it into a discount
 * with no explanation".
 */

export type RosterResult<T> =
  | { ok: true; id: T }
  | { ok: false; reason: "duplicate" | "not_found" };

/**
 * A driver's phone, normalised the way sign-in normalises one.
 *
 * Srinagar numbers get typed as ten bare digits. `+91` is assumed only when the
 * number does not already carry a country code — never rewriting one somebody
 * typed in full. Identical to `toE164` in `hooks/use-firebase-sign-in.ts`; the
 * two are separate because that one runs in the browser during sign-in and this
 * one runs on the server for an operator roster, and coupling them would drag
 * a client hook into a service.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+91${digits.replace(/^0+/, "")}`;
}

export async function createDriver(params: {
  name: string;
  phone: string;
  actor: { id: string; email: string };
}): Promise<RosterResult<string>> {
  const { name, actor } = params;
  const phone = normalisePhone(params.phone);

  /* The unique constraint is the guarantee; this check is the message. A
     second person cannot hold the same number, and finding out through a
     P2002 stack trace is not an answer a dispatcher can act on. */
  const existing = await db.driver.findUnique({ where: { phone }, select: { id: true } });
  if (existing) return { ok: false, reason: "duplicate" };

  try {
    return await db.$transaction(async (tx) => {
      const driver = await tx.driver.create({ data: { name, phone } });
      await recordAudit(tx, {
        actorType: "admin",
        actorId: actor.id,
        action: "driver.created",
        entityType: "driver",
        entityId: driver.id,
        after: { name, phone },
      });
      return { ok: true, id: driver.id } as const;
    });
  } catch {
    /* Lost the race to the unique constraint between the check and the write. */
    return { ok: false, reason: "duplicate" };
  }
}

export async function setDriverActive(params: {
  driverId: string;
  isActive: boolean;
  actor: { id: string; email: string };
}): Promise<RosterResult<string>> {
  const { driverId, isActive, actor } = params;

  return db.$transaction(async (tx) => {
    /* Guarded on the opposite state, so pressing Retire twice records one
       change rather than two clicks — the same shape the coupon pause uses. */
    const updated = await tx.driver.updateMany({
      where: { id: driverId, isActive: !isActive },
      data: { isActive },
    });

    if (updated.count === 0) {
      const exists = await tx.driver.findUnique({ where: { id: driverId }, select: { id: true } });
      return exists
        ? ({ ok: true, id: driverId } as const) // already in that state; nothing to record
        : ({ ok: false, reason: "not_found" } as const);
    }

    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: isActive ? "driver.reinstated" : "driver.retired",
      entityType: "driver",
      entityId: driverId,
      before: { isActive: !isActive },
      after: { isActive },
    });
    return { ok: true, id: driverId } as const;
  });
}

export async function createVehicle(params: {
  registration: string;
  kind: "bike" | "van" | "truck";
  actor: { id: string; email: string };
}): Promise<RosterResult<string>> {
  const { kind, actor } = params;
  /* Plates are written and read in upper case; storing them two ways makes the
     unique constraint useless. */
  const registration = params.registration.trim().toUpperCase();

  const existing = await db.vehicle.findUnique({
    where: { registration },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "duplicate" };

  try {
    return await db.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({ data: { registration, kind } });
      await recordAudit(tx, {
        actorType: "admin",
        actorId: actor.id,
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: vehicle.id,
        after: { registration, kind },
      });
      return { ok: true, id: vehicle.id } as const;
    });
  } catch {
    return { ok: false, reason: "duplicate" };
  }
}

export async function setVehicleActive(params: {
  vehicleId: string;
  isActive: boolean;
  actor: { id: string; email: string };
}): Promise<RosterResult<string>> {
  const { vehicleId, isActive, actor } = params;

  return db.$transaction(async (tx) => {
    const updated = await tx.vehicle.updateMany({
      where: { id: vehicleId, isActive: !isActive },
      data: { isActive },
    });

    if (updated.count === 0) {
      const exists = await tx.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true },
      });
      return exists
        ? ({ ok: true, id: vehicleId } as const)
        : ({ ok: false, reason: "not_found" } as const);
    }

    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: isActive ? "vehicle.reinstated" : "vehicle.retired",
      entityType: "vehicle",
      entityId: vehicleId,
      before: { isActive: !isActive },
      after: { isActive },
    });
    return { ok: true, id: vehicleId } as const;
  });
}

/** The whole roster, retired rows included, for the management screen. */
export async function listRoster() {
  const [drivers, vehicles] = await Promise.all([
    db.driver.findMany({
      select: { id: true, name: true, phone: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    db.vehicle.findMany({
      select: { id: true, registration: true, kind: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { registration: "asc" }],
    }),
  ]);
  return { drivers, vehicles };
}

export type Roster = Awaited<ReturnType<typeof listRoster>>;
