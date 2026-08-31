/**
 * How an order splits into physically separate deliveries.
 *
 * This lives outside `lib/services/` on purpose. The rule has to run in two
 * places: on the server when checkout persists shipments, and in the browser
 * when the cart shows the customer how their order will split. `services/
 * shipments.ts` is `server-only`, so a client cart importing from it would not
 * build — and the alternative, restating the rule in the cart, is precisely the
 * divergence that file warns about: "if those two ever diverge, the cart is
 * lying."
 *
 * Pure and synchronous — no database, no clock — so it can be tested directly
 * and rendered optimistically without a round trip.
 */

/** Mirrors Prisma's SpeedClass without importing the server client. */
export type ShipmentSpeedClass = "express" | "scheduled";

export interface PlannableLine {
  /** Identifies the line back to its OrderItem when persisting. */
  ref: string;
  qty: number;
  /** From Category.isBulk — heavy material travels by truck. */
  categoryIsBulk: boolean;
}

export interface PlannedShipment {
  /** 1-based and stable, so "Shipment 1 of 2" means the same thing every time. */
  sequence: number;
  speedClass: ShipmentSpeedClass;
  lines: { ref: string; qty: number }[];
}

/**
 * Groups order lines into shipments by how they travel.
 *
 * The grouping key is `Category.isBulk` — the same field the speed chip on
 * every product card reads — so the split a customer is told about at checkout
 * is the split that actually happens.
 *
 * Express goes first: it is the one that arrives today, so it should be the one
 * the customer sees at the top of the order.
 */
export function planShipments(lines: PlannableLine[]): PlannedShipment[] {
  const express: { ref: string; qty: number }[] = [];
  const scheduled: { ref: string; qty: number }[] = [];

  for (const line of lines) {
    if (line.qty <= 0) continue;
    (line.categoryIsBulk ? scheduled : express).push({ ref: line.ref, qty: line.qty });
  }

  const planned: PlannedShipment[] = [];
  // Order matters: express is sequence 1 when present.
  if (express.length > 0) {
    planned.push({ sequence: planned.length + 1, speedClass: "express", lines: express });
  }
  if (scheduled.length > 0) {
    planned.push({ sequence: planned.length + 1, speedClass: "scheduled", lines: scheduled });
  }
  return planned;
}
