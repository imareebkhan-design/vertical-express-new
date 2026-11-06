import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

/** Older saved addresses predate pin capture; they still deliver, but without navigation, route or live ETA. */
export function hasMapPin(a: { latitude?: unknown; longitude?: unknown } | null | undefined): boolean {
  return a != null && typeof a.latitude === "number" && typeof a.longitude === "number";
}

export const UNPINNED_ADDRESS_TEXT =
  "This address has no map pin. Add one so your delivery partner can navigate to your gate and you can follow the delivery live.";

/**
 * Shown under the chosen checkout address when it has no coordinates. Advisory:
 * the order can still be placed. Coordinates are never guessed from a pincode.
 */
export function UnpinnedAddressNotice({ action }: { action: ReactNode }) {
  return (
    <div role="note" className="mt-3 flex items-start gap-2 rounded-panel bg-ops-warn-tint p-3 text-[12.5px] font-semibold text-ops-warn">
      <MapPin className="mt-0.5 size-4 flex-none" aria-hidden />
      <div>
        <p>{UNPINNED_ADDRESS_TEXT}</p>
        <div className="mt-1.5">{action}</div>
      </div>
    </div>
  );
}
