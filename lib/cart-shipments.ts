import { planShipments, type ShipmentSpeedClass } from "@/lib/shipment-plan";

/**
 * Cart lines grouped into the shipments checkout will persist — for every
 * surface that shows the split: desktop cart, phone-web cart, and both
 * checkouts.
 *
 * The rule itself is `planShipments` (lib/shipment-plan.ts). This only maps its
 * refs back to the lines on screen. It used to be written out in each view,
 * and the phone-web cart had no copy at all, so the phone showed one list for a
 * basket that would arrive as two deliveries (W-18).
 */
export interface GroupableCartLine {
  itemId: string;
  /** Needed only to place a line on the express run (`expressRunVariantIds`). */
  variantId?: string;
  qty: number;
  categoryIsBulk: boolean;
  deliverySpeed: "express" | "scheduled" | null;
  lineTotalPaise: number;
}

export interface CartShipment<L extends GroupableCartLine> {
  sequence: number;
  speedClass: ShipmentSpeedClass;
  /** Present, and true, on the shipment carrying the express run the customer chose. */
  expressRun?: true;
  lines: L[];
  /** Units, not lines — the cart's own count. */
  itemCount: number;
  totalPaise: number;
}

/**
 * `expressRunVariantIds`: when the customer chose express, the variants the
 * server's current quote put on the express run (`totals.express.eligibleVariantIds`,
 * only while `totals.expressChosen`). They travel as their own shipment — the same
 * split placement persists (E7). Empty: the split without express.
 */
export function groupCartByShipment<L extends GroupableCartLine>(
  lines: L[],
  expressRunVariantIds: readonly string[] = []
): CartShipment<L>[] {
  const byId = new Map(lines.map((l) => [l.itemId, l]));
  return planShipments(
    lines.map((l) => ({
      ref: l.itemId,
      qty: l.qty,
      categoryIsBulk: l.categoryIsBulk,
      deliverySpeed: l.deliverySpeed,
      onExpressRun: l.variantId !== undefined && expressRunVariantIds.includes(l.variantId),
    }))
  ).map((sh) => {
    const grouped = sh.lines.map((pl) => byId.get(pl.ref)).filter((l): l is L => Boolean(l));
    return {
      sequence: sh.sequence,
      speedClass: sh.speedClass,
      ...(sh.expressRun ? { expressRun: true as const } : {}),
      lines: grouped,
      itemCount: grouped.reduce((n, l) => n + l.qty, 0),
      totalPaise: grouped.reduce((n, l) => n + l.lineTotalPaise, 0),
    };
  });
}
