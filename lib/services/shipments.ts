import "server-only";
import type { Prisma, SpeedClass } from "@prisma/client";

/**
 * Splitting an order into physically separate deliveries.
 *
 * A coil of wire and a tonne of cement do not travel together: the wire goes out
 * from the Srinagar store within the hour, the cement goes on a truck. One flat
 * `Order.status` cannot describe an order where one half is out for delivery and
 * the other has not been loaded, which is what `Shipment` exists to fix.
 *
 * The grouping rule is deliberately the same one the storefront already shows on
 * every product card — `Category.isBulk` — so the split a customer is told about
 * at checkout is the split that actually happens. If those two ever diverge, the
 * cart is lying.
 */

/** The minimum a line needs to be assigned to a shipment. */
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
  speedClass: SpeedClass;
  lines: { ref: string; qty: number }[];
}

/**
 * Groups order lines into shipments by how they travel.
 *
 * Express goes first: it is the one that arrives today, so it should be the one
 * the customer sees at the top of the order.
 *
 * Pure and synchronous — no database, no clock — so the rule can be tested
 * directly rather than through a checkout.
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

/**
 * Persists the planned shipments for an order.
 *
 * Runs inside the caller's transaction so an order can never exist without its
 * shipments — the same all-or-nothing guarantee the order, its items, its payment
 * and the stock decrement already share.
 */
export async function createShipmentsForOrder(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    warehouseId: string;
    /** Line refs must match the `ref` values given to planShipments. */
    orderItemIdByRef: Record<string, string>;
    planned: PlannedShipment[];
  }
): Promise<void> {
  for (const shipment of args.planned) {
    await tx.shipment.create({
      data: {
        orderId: args.orderId,
        sequence: shipment.sequence,
        speedClass: shipment.speedClass,
        warehouseId: args.warehouseId,
        items: {
          create: shipment.lines.map((l) => ({
            orderItemId: args.orderItemIdByRef[l.ref],
            qty: l.qty,
          })),
        },
      },
    });
  }
}
