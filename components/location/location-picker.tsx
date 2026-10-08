"use client";

import { locateForDelivery, searchDeliveryPlaces } from "@/actions/location";
import { LocationPickerView } from "./location-picker-view";

/** The location sheet's content, wired to the real server actions. See location-picker-view.tsx. */
export function LocationPicker({ onDone }: { onDone: () => void }) {
  return <LocationPickerView onDone={onDone} locate={locateForDelivery} search={searchDeliveryPlaces} />;
}
