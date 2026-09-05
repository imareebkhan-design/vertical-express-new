import type { ShipmentStatus } from "@/prisma/generated/client/client";

/**
 * The shipment state machine — the only definition of which move is legal.
 *
 * `Shipment` existed from `20260826095435_add_shipments` and was write-once for
 * every day of its life until this file: rows were created at `pending` inside
 * the checkout transaction and never advanced, with no `shipment.update`
 * anywhere outside a test comment. Every field the loop needs was already on
 * the model — `dispatchedAt`, `deliveredAt`, `deliveryCode`, `warehouseId` —
 * and all of them were permanently null.
 *
 * That was ISS-009, and it was why roughly eleven console screens had nothing
 * to show: a dispatch board with nothing to dispatch, a tracking page whose
 * timeline never left its first stage.
 *
 * Past tense throughout, deliberately. Written in the present it would have
 * become false the moment `lib/services/admin/shipments-write.ts` landed
 * beside it — which is exactly what happened to nine other files that said
 * drivers did not exist.
 *
 * Separate from `lib/order-flow.ts` on purpose. An order that mixes a coil of
 * wire with a tonne of cement has two shipments that move independently — the
 * wire is delivered while the cement is still in the warehouse — so one status
 * cannot describe both. Deriving `Order.status` from its shipments is
 * deliberately NOT done here: CLAUDE.md's expand/migrate/contract rule keeps
 * `Order.status` authoritative for now, and shipments are recorded alongside it.
 */

/** Allowed forward transitions. Absent means terminal. */
export const SHIPMENT_FLOW: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: ["packed", "cancelled"],
  packed: ["out_for_delivery", "cancelled"],
  /**
   * No route back to `packed`. Once goods are on a vehicle, "unpack it" is a
   * physical act with a physical record — the driver returns and the load is
   * received back — not a dropdown. A failed delivery becomes `cancelled`,
   * which restocks; it does not quietly rewind.
   */
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

/** Where a shipment in this state may go next. */
export function nextShipmentStatuses(current: ShipmentStatus): ShipmentStatus[] {
  return SHIPMENT_FLOW[current] ?? [];
}

/** Whether this exact move is legal. */
export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return nextShipmentStatuses(from).includes(to);
}

/**
 * The stage a shipment must reach before a delivery code is worth anything.
 *
 * The code is what the customer reads out at the gate, so it has to exist
 * before the driver leaves and must not exist before that — a code sitting on
 * a shipment still in the warehouse is a credential with a long, pointless
 * exposure.
 */
export const CODE_ISSUED_AT: ShipmentStatus = "out_for_delivery";

/**
 * A six-digit handover code.
 *
 * The schema already decided this exists and what it is for — "Shared with the
 * driver at the gate to confirm handover" — so the shape is the only open
 * question, and six digits is what a person can read down a phone line without
 * repeating themselves.
 *
 * `crypto.randomInt` rather than `Math.random`: this is the single thing
 * standing between "the driver says it was delivered" and it actually having
 * been. Uniform over the full range, leading zeros preserved.
 */
export function generateDeliveryCode(randomInt: (min: number, max: number) => number): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
