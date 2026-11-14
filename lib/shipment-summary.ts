/**
 * How an order's shipments read at a glance on the ops Orders table.
 *
 * The artboard gives Orders a Shipments column, and the reason is operational:
 * a two-shipment order is two vehicles on two schedules, and the row that
 * hides that reads as one job. The summary says how many there are and how far
 * along they are — never a promised time, because no slot model exists.
 *
 * Pure, so the wording is tested rather than eyeballed in a table.
 */
export interface SummarisableShipment {
  status: string;
  speedClass: string;
}

export interface ShipmentSummary {
  count: number;
  /** "2 · 1 delivered", "1 · on the way", "—" when checkout predates the split. */
  label: string;
  /** True when any shipment still needs a driver. */
  needsDispatch: boolean;
}

const DONE = "delivered";
const MOVING = "out_for_delivery";

export function summariseShipments(shipments: SummarisableShipment[]): ShipmentSummary {
  const live = shipments.filter((s) => s.status !== "cancelled");
  if (live.length === 0) {
    /* Orders placed before shipments existed have none, and an order whose
       shipments were all cancelled has none live. Both are "—", not "0
       shipments", which would read as a fault. */
    return { count: 0, label: "—", needsDispatch: false };
  }

  const delivered = live.filter((s) => s.status === DONE).length;
  const moving = live.filter((s) => s.status === MOVING).length;
  const waiting = live.length - delivered - moving;

  let state: string;
  if (delivered === live.length) state = "all delivered";
  else if (delivered > 0) state = `${delivered} of ${live.length} delivered`;
  else if (moving > 0) state = moving === live.length ? "on the way" : `${moving} on the way`;
  else state = "awaiting dispatch";

  return { count: live.length, label: `${live.length} · ${state}`, needsDispatch: waiting > 0 };
}
