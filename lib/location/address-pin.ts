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

/**
 * The address fields a confirmed pin decides. Customer-entered fields are left exactly as typed.
 *
 * City and state are pre-filled from the pin (`placeFromPin`) but stay the
 * customer's to correct — Google's locality is wrong often enough on Srinagar
 * lanes that the agreed flow keeps them editable (issue #1). A value the
 * customer left in the field therefore wins; the pin fills only an empty one.
 * The pincode is the pin's: correcting it means moving the pin.
 */
export function withPinnedLocation<T extends AddressFields>(
  values: T,
  pin: PinnedLocation
): T & { line2: string | null; pincode: string; latitude: number; longitude: number; placeId: string | null } {
  return {
    ...values,
    line2: areaLine(pin) || null,
    city: values.city?.trim() ? values.city : pin.city ?? values.city,
    state: values.state?.trim() ? values.state : pin.state ?? values.state,
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

/**
 * The city and state a newly confirmed pin puts in the form, for the customer
 * to check and correct. Only what Google gave: a pin from the location sheet
 * carries no state, and nothing is ever assumed in its place — the forms used
 * to start from "Srinagar" / "Jammu & Kashmir", so a Delhi site was saved as one
 * in J&K and nobody saw it happen.
 */
export function placeFromPin(pin: Pick<PinnedLocation, "city" | "state"> | null): { city?: string; state?: string } {
  return {
    ...(pin?.city?.trim() ? { city: pin.city } : {}),
    ...(pin?.state?.trim() ? { state: pin.state } : {}),
  };
}

export type PinPincodeCheck = { kind: "match" } | { kind: "mismatch"; pinPincode: string } | { kind: "unchecked" } | { kind: "no_pin" };

/**
 * Does the pin agree with the pincode the order will be delivered to? Read from
 * the order's address snapshot, where `pinPincode` is Google's pincode for the
 * pin, recorded when the address was saved. A mismatch is kept, never refused
 * (owner, 16 Oct 2026) — this only tells ops to check before dispatch. A
 * snapshot without one (saved before 16 Oct, or Google did not answer) is
 * unchecked, not a mismatch.
 */
export function pinPincodeCheck(snapshot: Record<string, unknown> | null | undefined): PinPincodeCheck {
  const s = snapshot ?? {};
  if (typeof s.latitude !== "number" || typeof s.longitude !== "number") return { kind: "no_pin" };
  if (typeof s.pinPincode !== "string" || !s.pinPincode) return { kind: "unchecked" };
  return s.pinPincode === s.pincode ? { kind: "match" } : { kind: "mismatch", pinPincode: s.pinPincode };
}

/**
 * Said beside the State field. For a pincode we deliver to, the saved state is
 * the pincode's (lib/services/addresses.ts `stateFor`), whatever was typed; the
 * city is always the customer's (audit F4).
 */
export const STATE_FROM_PINCODE_NOTE = "For pincodes we deliver to, the state is set by the pincode. Your city is saved as you enter it.";
