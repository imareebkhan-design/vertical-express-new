"use client";

import { AddressLocationField, type PinnedLocation } from "./address-location-field";
import { LocationPicker } from "./location-picker";

/** The address form's location field, wired to the real server actions. See address-location-field.tsx. */
export function AddressLocation(props: { value: PinnedLocation | null; onChange: (place: PinnedLocation) => void }) {
  return <AddressLocationField {...props} picker={(p) => <LocationPicker {...p} />} />;
}
