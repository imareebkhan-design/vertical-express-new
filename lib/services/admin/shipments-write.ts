import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { ShipmentStatus } from "@/prisma/generated/client/client";
import { recordAudit } from "@/lib/services/audit";
import { releaseOrderInventory } from "@/lib/services/orders";
import { rateLimit } from "@/lib/services/rate-limit";
import {
  canTransitionShipment,
  CODE_ISSUED_AT,
  generateDeliveryCode,
} from "@/lib/shipment-flow";

/**
 * Advancing a shipment — the write half of the fulfilment loop.
 *
 * `Shipment` rows have been created at `pending` and never touched since the
 * model was added. This is the first code that moves one, and it is the piece
 * roughly eleven console screens are waiting on.
 *
 * Three rules, each of which exists because of a way this goes wrong:
 *
 *   The move must be legal. `lib/shipment-flow.ts` owns that, and this file
 *   does not restate it — the order state machine was restated in three places
 *   before it was consolidated (ISS-014), and the same mistake was available
 *   here.
 *
 *   The transition, the timestamps, the delivery code and the audit row are one
 *   transaction. A dispatch that commits without its audit row is a shipment
 *   that left the warehouse with nobody's name against it.
 *
 *   The read and the write are one statement. `updateMany` guarded on the
 *   status we believe the row is in, rather than read-then-write, so two
 *   operators pressing Dispatch at the same moment produce one dispatch and one
 *   refusal — not two, and not a lost update. This is the pattern the stock
 *   decrement already uses.
 */

export type AdvanceResult =
  | { ok: true; status: ShipmentStatus; deliveryCode: string | null }
  | { ok: false; reason: "not_found" | "illegal_transition" | "raced" | "no_driver" };

/**
 * Move one shipment to `to`.
 *
 * Never throws for an ordinary refusal — an illegal move and a lost race are
 * both normal answers a console screen renders differently.
 */
export async function advanceShipment(params: {
  shipmentId: string;
  to: ShipmentStatus;
  actor: { id: string; email: string };
}): Promise<AdvanceResult> {
  const { shipmentId, to, actor } = params;

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      status: true,
      orderId: true,
      warehouseId: true,
      sequence: true,
      driverId: true,
    },
  });
  if (!shipment) return { ok: false, reason: "not_found" };
  if (!canTransitionShipment(shipment.status, to)) {
    return { ok: false, reason: "illegal_transition" };
  }

  /* Goods do not leave without a name against them.
   *
   * This is the one rule here that is a decision rather than a mechanism, so it
   * is worth stating plainly: dispatching with no driver produces a delivery
   * code that proves nothing, because there is nobody it was given to. The
   * whole point of the code is to tie a handover to a person. A vehicle stays
   * optional — a rider on their own bike is a real case in Srinagar. */
  if (to === "out_for_delivery" && !shipment.driverId) {
    return { ok: false, reason: "no_driver" };
  }

  const from = shipment.status;

  /* The code is issued exactly once, at the moment the goods leave. Generating
     it earlier would leave a live credential sitting on a row in the warehouse;
     generating it again on a later transition would invalidate the one the
     customer was already given. */
  const deliveryCode = to === CODE_ISSUED_AT ? generateDeliveryCode(randomInt) : null;

  const now = new Date();

  return db.$transaction(async (tx) => {
    /* Guarded on the status we read. If anything moved the row in between, this
       matches zero rows and we report the race rather than overwriting it. */
    const updated = await tx.shipment.updateMany({
      where: { id: shipmentId, status: from },
      data: {
        status: to,
        ...(to === "out_for_delivery" ? { dispatchedAt: now, deliveryCode } : {}),
        ...(to === "delivered" ? { deliveredAt: now } : {}),
      },
    });

    if (updated.count === 0) return { ok: false, reason: "raced" } as const;

    /* A cancelled shipment's goods go back on the shelf. Recorded separately
       from the status change because it is a different kind of loss to
       investigate — the same split the admin order cancellation makes. */
    if (to === "cancelled") {
      await releaseOrderInventory(tx, shipment.orderId, shipment.warehouseId);
      await recordAudit(tx, {
        actorType: "admin",
        actorId: actor.id,
        action: "inventory.released",
        entityType: "shipment",
        entityId: shipmentId,
        before: { reason: "shipment_cancelled", warehouseId: shipment.warehouseId },
      });
    }

    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "shipment.status_changed",
      entityType: "shipment",
      entityId: shipmentId,
      before: { status: from },
      /* The code itself is not written to the audit trail. It is a credential a
         customer reads out at their gate, and an append-only log that operators
         can read is the wrong place for it. That it was issued, and when, is
         recorded; what it is, is not. */
      after: {
        status: to,
        orderId: shipment.orderId,
        sequence: shipment.sequence,
        ...(deliveryCode ? { deliveryCodeIssued: true } : {}),
        /* A delivery marked here has no proof behind it — nobody read a code
           back. `confirmDelivery` is the path that has proof, and records it.
           The two must be distinguishable in the trail, because "delivered"
           with and without a customer confirming it are different claims. */
        ...(to === "delivered" ? { proof: "none" } : {}),
      },
    });

    return { ok: true, status: to, deliveryCode } as const;
  });
}

export type AssignResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_gone" | "driver_unavailable" | "vehicle_unavailable" };

/**
 * Put a driver and optionally a vehicle against a shipment.
 *
 * Separate from advancing it. Assignment happens while the goods are still in
 * the warehouse and is routinely changed — a rider calls in sick, a van is
 * blocked in — so binding it to the dispatch action would mean cancelling and
 * re-dispatching to correct a name.
 *
 * Refused once the goods have left. Reassigning a shipment that is already on
 * the road rewrites who took it, which is the one fact proof of delivery
 * depends on.
 *
 * A vehicle is optional and a driver is not: see `advanceShipment`, which will
 * not dispatch without one.
 */
export async function assignShipment(params: {
  shipmentId: string;
  driverId: string;
  vehicleId?: string | null;
  actor: { id: string; email: string };
}): Promise<AssignResult> {
  const { shipmentId, driverId, vehicleId = null, actor } = params;

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, status: true, driverId: true, vehicleId: true },
  });
  if (!shipment) return { ok: false, reason: "not_found" };

  /* Only while it is still ours to hand over. */
  if (shipment.status !== "pending" && shipment.status !== "packed") {
    return { ok: false, reason: "already_gone" };
  }

  const driver = await db.driver.findUnique({
    where: { id: driverId },
    select: { id: true, isActive: true },
  });
  if (!driver || !driver.isActive) return { ok: false, reason: "driver_unavailable" };

  if (vehicleId) {
    const vehicle = await db.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, isActive: true },
    });
    if (!vehicle || !vehicle.isActive) return { ok: false, reason: "vehicle_unavailable" };
  }

  return db.$transaction(async (tx) => {
    /* Guarded on the status read, for the same reason the advance is: a
       shipment that leaves between the check and the write must not have its
       driver rewritten afterwards. */
    const updated = await tx.shipment.updateMany({
      where: { id: shipmentId, status: shipment.status },
      data: { driverId, vehicleId },
    });
    if (updated.count === 0) return { ok: false, reason: "already_gone" } as const;

    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "shipment.assigned",
      entityType: "shipment",
      entityId: shipmentId,
      before: { driverId: shipment.driverId, vehicleId: shipment.vehicleId },
      after: { driverId, vehicleId },
    });

    return { ok: true } as const;
  });
}

/**
 * How many wrong codes before the shipment stops accepting any.
 *
 * Six digits is a million values, which a script exhausts in minutes if nothing
 * stops it. The numbers match the OTP bucket rather than being chosen fresh —
 * DEC-016 settled five attempts per fifteen minutes for a credential of this
 * kind, and having two different answers to the same question in one codebase
 * is how one of them drifts.
 *
 * Keyed on the shipment, not the caller. The credential belongs to one
 * shipment, and an attacker who rotates IP addresses would walk straight past a
 * per-caller limit.
 */
const POD_ATTEMPTS = 5;
const POD_WINDOW_MS = 15 * 60 * 1000;

export type ConfirmResult =
  | { ok: true }
  /* Deliberately coarse. A wrong code, a shipment that does not exist and a
     shipment that is not out for delivery are all "rejected", because telling
     them apart tells an attacker which shipment ids are real and which are in
     the air right now. */
  | { ok: false; reason: "rejected" | "rate_limited" };

/**
 * Proof of delivery: the customer reads the code at the gate.
 *
 * This is the only path to `delivered` that means anything. `advanceShipment`
 * can still mark a shipment delivered — a customer who was not there to read
 * the code has to be handled somehow — but it records `proof: "none"`, so a
 * delivery nobody confirmed is visibly different in the audit trail from one
 * somebody did.
 *
 * **When an operator may override is a policy question, not a mechanism.** Both
 * paths exist and are distinguishable; which is permitted, and what has to be
 * true first, is the owner's to set.
 *
 * The code never appears in a log, an audit row or an error. What is recorded
 * is that a matching code was presented.
 */
export async function confirmDelivery(params: {
  shipmentId: string;
  code: string;
  actor: { id: string; email: string };
}): Promise<ConfirmResult> {
  const { shipmentId, code, actor } = params;

  /* Fail closed. A limiter outage must not open a million-value brute force on
     a credential that stands between goods and the wrong person. */
  const limit = await rateLimit(`pod:${shipmentId}`, POD_ATTEMPTS, POD_WINDOW_MS, {
    failClosed: true,
  });
  if (!limit.allowed) return { ok: false, reason: "rate_limited" };

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, status: true, deliveryCode: true, orderId: true, sequence: true },
  });

  /* Every rejection below returns the same thing and does the same comparison
     work, so a caller cannot tell a missing shipment from a wrong code by what
     comes back or by how long it took. */
  const expected = shipment?.deliveryCode ?? null;
  const matches = constantTimeEquals(code, expected);

  if (!shipment || shipment.status !== "out_for_delivery" || !matches) {
    return { ok: false, reason: "rejected" };
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.shipment.updateMany({
      where: { id: shipmentId, status: "out_for_delivery" },
      data: { status: "delivered", deliveredAt: new Date() },
    });
    if (updated.count === 0) return { ok: false, reason: "rejected" } as const;

    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "shipment.status_changed",
      entityType: "shipment",
      entityId: shipmentId,
      before: { status: "out_for_delivery" },
      /* That a matching code was presented — never the code itself. */
      after: {
        status: "delivered",
        orderId: shipment.orderId,
        sequence: shipment.sequence,
        proof: "delivery_code",
      },
    });

    return { ok: true } as const;
  });
}

/**
 * Compare two codes without letting the clock describe them.
 *
 * `timingSafeEqual` needs equal-length buffers and throws otherwise, so a naive
 * length check in front of it leaks the expected length through an early
 * return. Both sides are padded to a fixed width first, and the length
 * difference is folded into the result rather than short-circuiting it.
 *
 * A null expectation — a shipment with no code issued — still does the full
 * comparison and returns false.
 */
function constantTimeEquals(given: string, expected: string | null): boolean {
  const WIDTH = 32;
  const a = Buffer.alloc(WIDTH);
  const b = Buffer.alloc(WIDTH);
  a.write(given.slice(0, WIDTH));
  b.write((expected ?? "").slice(0, WIDTH));

  const sameBytes = timingSafeEqual(a, b);
  const sameLength = given.length === (expected ?? "").length;
  const haveExpected = expected !== null;
  return sameBytes && sameLength && haveExpected;
}
