import "server-only";
import type { getCartSummary } from "@/lib/services/cart";
import { planShipments } from "@/lib/services/shipments";

/**
 * The cart, plus how it will split into deliveries.
 *
 * `shipments` is `planShipments` — the same function checkout runs when it
 * persists `Shipment` rows — so the split the customer is shown is the split
 * that happens. Every cart response a device receives carries it, so the app
 * renders the plan and never re-derives it.
 */
export function withShipments(summary: Awaited<ReturnType<typeof getCartSummary>>) {
  return {
    ...summary,
    shipments: planShipments(
      summary.lines.map((l) => ({ ref: l.itemId, qty: l.qty, categoryIsBulk: l.categoryIsBulk, deliverySpeed: l.deliverySpeed }))
    ).map((s) => ({ sequence: s.sequence, speedClass: s.speedClass, itemIds: s.lines.map((l) => l.ref) })),
  };
}
