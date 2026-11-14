"use client";

import { locateForDelivery, searchDeliveryPlaces } from "@/actions/location";
import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";
import { LocationPickerView } from "./location-picker-view";

/** The location sheet's content, wired to the real server actions. See location-picker-view.tsx. */
export function LocationPicker({ onDone, onPick }: { onDone: () => void; onPick?: (place: DeliveryCandidate) => void }) {
  return <LocationPickerView onDone={onDone} onPick={onPick} locate={locateForDelivery} search={searchDeliveryPlaces} />;
}
