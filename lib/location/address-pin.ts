import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";

/**
 * The two halves of a saved address, kept apart:
 *
 *   from Google, via a confirmed pin — the area line (`line2`), pincode, city,
 *   state and coordinates;
 *   from the customer — house / flat / floor (`line1`), landmark, gate
 *   instructions (`accessNote`), label, name and phone.
 *
 * The pin's coordinates are what the order carries as its destination, and so
 * what a route and an ETA are computed to. An address saved without one (typed
 * by hand) still delivers, by landmark; it just cannot be tracked to the gate.
 */
export type PinnedLocation = Pick<DeliveryCandidate, "label" | "formattedAddress" | "pincode" | "city" | "state" | "lat" | "lng" | "placeId">;

interface AddressFields {
  line2?: string | null;
  placeId?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
}

const LINE2_MAX = 160;

/** The formatted line without the city and pincode the address stores in their own fields. */
export function areaLine(pin: Pick<PinnedLocation, "formattedAddress" | "pincode" | "city">): string {
  let line = pin.formattedAddress.trim();
  if (pin.pincode && line.endsWith(pin.pincode)) line = line.slice(0, -pin.pincode.length).trim();
  if (pin.city && line.toLowerCase().endsWith(`, ${pin.city.toLowerCase()}`)) line = line.slice(0, -(pin.city.length + 2)).trim();
  line = line.replace(/,\s*$/, "");
  return line.slice(0, LINE2_MAX);
}

/** The address fields a confirmed pin decides. Customer-entered fields are left exactly as typed. */
export function withPinnedLocation<T extends AddressFields>(
  values: T,
  pin: PinnedLocation
): T & { line2: string | null; pincode: string; latitude: number; longitude: number; placeId: string | null } {
  return {
    ...values,
    line2: areaLine(pin) || null,
    city: pin.city ?? values.city,
    state: pin.state ?? values.state,
    pincode: pin.pincode,
    latitude: pin.lat,
    longitude: pin.lng,
    placeId: pin.placeId,
  };
}

/** A saved address's own pin, if it has one. */
export function pinnedFromAddress(a: AddressFields): PinnedLocation | null {
  if (typeof a.latitude !== "number" || typeof a.longitude !== "number" || !a.pincode) return null;
  const area = a.line2?.trim() || null;
  const city = a.city ?? null;
  return {
    label: area?.split(",")[0]?.trim() || city || a.pincode,
    formattedAddress: [area, city].filter(Boolean).join(", ") + ` ${a.pincode}`,
    pincode: a.pincode,
    city,
    state: a.state ?? null,
    lat: a.latitude,
    lng: a.longitude,
    placeId: a.placeId ?? null,
  };
}

/** The place confirmed in the location sheet, as a starting pin for a new address. */
export function pinnedFromPlace(
  place: { label: string; formattedAddress: string; lat: number; lng: number; placeId: string | null } | null,
  pincode: string | null,
  city: string | null
): PinnedLocation | null {
  if (!place || !pincode) return null;
  return { label: place.label, formattedAddress: place.formattedAddress, pincode, city, state: null, lat: place.lat, lng: place.lng, placeId: place.placeId };
}
