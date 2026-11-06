"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";
import type { PinnedLocation } from "@/lib/location/address-pin";

/**
 * The map half of an address: where the gate is, as Google and the customer
 * agreed it. It fills the fields Google knows — area line, pincode, city,
 * state, coordinates — and leaves the house number, floor, landmark and gate
 * instructions to the customer, because Google does not know them.
 *
 * Without coordinates an order has no destination: no route, no ETA, and the
 * driver navigates by landmark alone. So this is the first thing the form asks.
 */
export type { PinnedLocation };

export function AddressLocationField({
  value,
  onChange,
  picker,
}: {
  value: PinnedLocation | null;
  onChange: (place: PinnedLocation) => void;
  /** The location picker. `AddressLocation` (address-location.tsx) passes the one wired to the server actions. */
  picker: (props: { onDone: () => void; onPick: (place: DeliveryCandidate) => void }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(value === null);

  if (open) {
    return (
      <div className="rounded-2xl border border-line bg-hush/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">Delivery location</p>
          {value ? (
            <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] font-bold text-ink-700 hover:text-ink">
              Cancel
            </button>
          ) : null}
        </div>
        {picker({
          onDone: () => setOpen(false),
          onPick: (c) =>
            onChange({
              label: c.label,
              formattedAddress: c.formattedAddress,
              pincode: c.pincode,
              city: c.city,
              state: c.state,
              lat: c.lat,
              lng: c.lng,
              placeId: c.placeId,
            }),
        })}
      </div>
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-left hover:border-ink"
      >
        <MapPin className="size-5 flex-none text-ink" aria-hidden />
        <span>
          <span className="block text-[14px] font-bold text-ink">Set the delivery location</span>
          <span className="block text-[12.5px] font-medium text-ink-500">So the driver and live tracking can find the gate.</span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-paper p-4 shadow-card">
      <MapPin className="mt-0.5 size-5 flex-none text-ink" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">Delivery location</p>
        <p className="mt-1 text-[14px] font-bold text-ink">{value.label}</p>
        <p className="mt-0.5 text-[13px] font-medium leading-[18px] text-ink-700">{value.formattedAddress}</p>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="flex-none text-[13px] font-bold text-ink underline underline-offset-2">
        Change
      </button>
    </div>
  );
}
