import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import type { ShipmentStatus } from "@/prisma/generated/client/client";
import { recordAudit } from "@/lib/services/audit";
import { releaseOrderInventory } from "@/lib/services/orders";
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
  | { ok: false; reason: "not_found" | "illegal_transition" | "raced" };

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
    select: { id: true, status: true, orderId: true, warehouseId: true, sequence: true },
  });
  if (!shipment) return { ok: false, reason: "not_found" };
  if (!canTransitionShipment(shipment.status, to)) {
    return { ok: false, reason: "illegal_transition" };
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
      },
    });

    return { ok: true, status: to, deliveryCode } as const;
  });
}
