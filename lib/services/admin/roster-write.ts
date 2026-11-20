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
  | { ok: false; reason: "duplicate" | "not_found" | "bound" | "on_delivery" };

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

/** Shipment states in which a driver is holding goods for a customer. */
const ACTIVE_SHIPMENT: ("packed" | "out_for_delivery")[] = ["packed", "out_for_delivery"];

/**
 * Edit a driver. The name can always change. The phone can change only until
 * the driver has signed in to the app once: after that the phone is how their
 * Firebase account was bound (`Driver.firebaseUid`, see `resolveDriver`), and
 * moving it would let a different person's phone take over the identity
 * silently. A lost or replaced phone goes through `releaseDriverLogin`, which
 * is explicit and audited.
 */
export async function updateDriver(params: {
  driverId: string;
  name: string;
  phone: string;
  actor: { id: string; email: string };
}): Promise<RosterResult<string>> {
  const { driverId, name, actor } = params;
  const phone = normalisePhone(params.phone);
  return db.$transaction(async (tx) => {
    const current = await tx.driver.findUnique({ where: { id: driverId }, select: { name: true, phone: true, firebaseUid: true } });
    if (!current) return { ok: false, reason: "not_found" } as const;
    if (phone !== current.phone) {
      if (current.firebaseUid) return { ok: false, reason: "bound" } as const;
      const clash = await tx.driver.findUnique({ where: { phone }, select: { id: true } });
      if (clash) return { ok: false, reason: "duplicate" } as const;
    }
    if (name === current.name && phone === current.phone) return { ok: true, id: driverId } as const;
    await tx.driver.update({ where: { id: driverId }, data: { name, phone } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "driver.updated",
      entityType: "driver",
      entityId: driverId,
      before: { name: current.name, phone: current.phone },
      after: { name, phone },
    });
    return { ok: true, id: driverId } as const;
  });
}

/**
 * Unbind a driver's app login so their next verified sign-in with the same
 * number binds afresh — for a lost or replaced phone. Deliberate and audited
 * with a reason; refused while the driver is out on a delivery, because the
 * login is what proves who is carrying those goods.
 */
export async function releaseDriverLogin(params: {
  driverId: string;
  reason: string;
  actor: { id: string; email: string };
}): Promise<RosterResult<string>> {
  const { driverId, reason, actor } = params;
  return db.$transaction(async (tx) => {
    const d = await tx.driver.findUnique({ where: { id: driverId }, select: { firebaseUid: true } });
    if (!d) return { ok: false, reason: "not_found" } as const;
    const onRoad = await tx.shipment.count({ where: { driverId, status: "out_for_delivery" } });
    if (onRoad > 0) return { ok: false, reason: "on_delivery" } as const;
    if (!d.firebaseUid) return { ok: true, id: driverId } as const;
    await tx.driver.update({ where: { id: driverId }, data: { firebaseUid: null } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "driver.login_released",
      entityType: "driver",
      entityId: driverId,
      before: { appLinked: true },
      after: { appLinked: false, reason },
    });
    return { ok: true, id: driverId } as const;
  });
}

/** Everything the Drivers & vehicles screen shows, retired rows included. */
export async function listRosterDetailed() {
  const [drivers, vehicles] = await Promise.all([
    db.driver.findMany({
      select: {
        id: true, name: true, phone: true, isActive: true, createdAt: true, firebaseUid: true,
        shipments: {
          where: { status: { in: ACTIVE_SHIPMENT } },
          select: { id: true, status: true, order: { select: { orderNo: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { shipments: { where: { status: "delivered" } } } },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    db.vehicle.findMany({
      select: {
        id: true, registration: true, kind: true, isActive: true, createdAt: true,
        _count: { select: { shipments: { where: { status: { in: ACTIVE_SHIPMENT } } } } },
      },
      orderBy: [{ isActive: "desc" }, { registration: "asc" }],
    }),
  ]);
  return {
    drivers: drivers.map(({ firebaseUid, _count, ...d }) => ({
      ...d,
      /* Whether the driver has completed their first app sign-in. The uid itself never leaves the server. */
      appLinked: firebaseUid !== null,
      deliveredCount: _count.shipments,
    })),
    vehicles: vehicles.map(({ _count, ...v }) => ({ ...v, activeShipments: _count.shipments })),
  };
}

export type RosterDetailed = Awaited<ReturnType<typeof listRosterDetailed>>;
