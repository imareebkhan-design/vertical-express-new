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
  /**
   * `Product.deliverySpeed` — the lister's override of the category rule (a
   * 5 kg bag of white cement does not need a truck). Null or absent means
   * "use the category", exactly as `speedClassFor` in lib/speed.ts reads it.
   */
  deliverySpeed?: ShipmentSpeedClass | null;
  /**
   * The customer chose express and the server put this line on the express run
   * (`ExpressOption.eligibleVariantIds`). Only a bike-class line can be: a truck
   * line is never express-eligible (`resolveExpressOption`), and is ignored here
   * if marked anyway.
   */
  onExpressRun?: boolean;
}

export interface PlannedShipment {
  /** 1-based and stable, so "Shipment 1 of 2" means the same thing every time. */
  sequence: number;
  speedClass: ShipmentSpeedClass;
  /** Present, and true, only on the shipment carrying the express run the customer chose. */
  expressRun?: true;
  lines: { ref: string; qty: number }[];
}

/** How one line travels: the product's own speed if set, else its category's. */
export function speedClassOf(line: { categoryIsBulk: boolean; deliverySpeed?: ShipmentSpeedClass | null }): ShipmentSpeedClass {
  return line.deliverySpeed ?? (line.categoryIsBulk ? "scheduled" : "express");
}

/**
 * Groups order lines into shipments by how they travel.
 *
 * The grouping key is the product's own `deliverySpeed` when one was set, and
 * `Category.isBulk` otherwise — the same rule the speed chip on every product
 * card reads (`speedClassFor`) — so the split a customer is told about at
 * checkout is the split that actually happens.
 *
 * Express goes first: it is the one that arrives today, so it should be the one
 * the customer sees at the top of the order.
 *
 * When the customer chose express (E7), the lines on the express run travel as
 * their own shipment, first — the one they paid for. Other bike-class lines
 * follow as they would have, and truck lines go on the truck. With no express
 * run the split is exactly what it always was.
 */
export function planShipments(lines: PlannableLine[]): PlannedShipment[] {
  const run: { ref: string; qty: number }[] = [];
  const express: { ref: string; qty: number }[] = [];
  const scheduled: { ref: string; qty: number }[] = [];

  for (const line of lines) {
    if (line.qty <= 0) continue;
    const speed = speedClassOf(line);
    const bucket = speed === "scheduled" ? scheduled : line.onExpressRun ? run : express;
    bucket.push({ ref: line.ref, qty: line.qty });
  }

  const planned: PlannedShipment[] = [];
  if (run.length > 0) {
    planned.push({ sequence: planned.length + 1, speedClass: "express", expressRun: true, lines: run });
  }
  // Order matters: express is first when present.
  if (express.length > 0) {
    planned.push({ sequence: planned.length + 1, speedClass: "express", lines: express });
  }
  if (scheduled.length > 0) {
    planned.push({ sequence: planned.length + 1, speedClass: "scheduled", lines: scheduled });
  }
  return planned;
}
