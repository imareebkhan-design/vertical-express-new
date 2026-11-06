import { SpeedChip } from "@/components/ui/speed-chip";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import type { ShipmentSpeedClass } from "@/lib/shipment-plan";

interface ShipmentReviewProps {
  /** From `groupCartByShipment` — the split the order will be placed with. */
  shipments: { sequence: number; speedClass: ShipmentSpeedClass; expressRun?: boolean; itemCount: number }[];
}

/**
 * "Your shipments" — how the basket travels, for the desktop and phone-web
 * checkouts.
 *
 * The artboards (`Checkout`, `MobileCheckout`) title this "Slot for each
 * shipment" and put a date strip and two-hour windows under each card. There
 * is no Slot model and `Shipment.promisedAt` is null until one exists, so a
 * picker would take a choice and quietly drop it, and no arrival time is
 * claimed for either shipment. Only a truck shipment has a truck to arrange.
 *
 * Lifted out of the desktop checkout unchanged (W-B1-G1): the phone checkout
 * had no shipment review at all.
 */
export function ShipmentReview({ shipments }: ShipmentReviewProps) {
  const count = shipments.length;
  return (
    <div>
      <p className="mb-4 text-[13px] font-medium leading-[18.5px] text-ink-700">
        {count > 1 ? `${count} shipments — they travel separately.` : "One shipment."}
      </p>

      <ul className="space-y-3">
        {shipments.map((sh) => (
          <li
            key={sh.sequence}
            aria-label={count > 1 ? `Shipment ${sh.sequence} of ${count}` : "Shipment"}
            className="rounded-[20px] border border-line bg-canvas p-4"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <SpeedChip speed={sh.speedClass} />
              {count > 1 && (
                <span className="text-[13px] font-bold text-ink">
                  Shipment {sh.sequence} of {count}
                </span>
              )}
              <span className="text-[12px] font-medium text-ink-500">
                {sh.itemCount} {sh.itemCount === 1 ? "item" : "items"}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] font-medium leading-[17px] text-ink-500">
              {sh.expressRun
                ? "On the express run you chose."
                : sh.speedClass === "express"
                  ? "Small goods, out from the Srinagar store."
                  : "Heavy material, by truck."}
            </p>
          </li>
        ))}
      </ul>

      {shipments.some((sh) => sh.speedClass === "scheduled") && (
        <p className="mt-3 text-[12.5px] font-medium leading-[17px] text-ink-700">
          <PlaceholderValue pending="slot booking is not built — no Slot model, and ops has not confirmed the windows">
            We&rsquo;ll call to arrange the truck delivery.
          </PlaceholderValue>
        </p>
      )}
    </div>
  );
}
