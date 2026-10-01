/**
 * Turning a Google Geocoding API response into an address a customer confirms.
 *
 * Kept apart from `lib/services/geocoding.ts` so the parsing — the part with
 * real edge cases — is pure and testable without a network or a key.
 *
 * WHAT GOOGLE DECIDES AND WHAT IT DOES NOT
 *
 * Google answers "where is this point": a street, a locality, a pincode. It
 * does not answer "do we deliver there" — that is `ServiceablePincode`, and the
 * caller asks it separately. Nothing in this file knows which pincodes we serve.
 */

export interface GeocodeComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GeocodeResult {
  formatted_address?: string;
  address_components?: GeocodeComponent[];
  types?: string[];
}

export interface GeocodeResponse {
  status?: string;
  results?: GeocodeResult[];
}

/** What the confirmation screen pre-fills. Every field is editable there. */
export interface ResolvedAddress {
  /** Street-level line — house, street, neighbourhood. May be empty. */
  line1: string;
  /** The neighbourhood a Srinagar customer would name — "Hyderpora". */
  locality: string | null;
  city: string | null;
  state: string | null;
  pincode: string;
}

export type ParsedGeocode =
  | { kind: "found"; address: ResolvedAddress }
  /** Google answered, but nothing it returned carries an Indian pincode. */
  | { kind: "no_pincode" }
  /** Google could not answer: quota, key, or its own failure. */
  | { kind: "provider_error"; status: string };

const PINCODE = /^\d{6}$/;

function pick(components: GeocodeComponent[], ...types: string[]): string | null {
  for (const t of types) {
    const hit = components.find((c) => c.types.includes(t));
    if (hit?.long_name) return hit.long_name;
  }
  return null;
}

/**
 * Chooses the most specific result that carries a pincode.
 *
 * Google orders results most-specific first. The first one is often a plus
 * code or a bare route with no postal code in rural and peri-urban areas, so
 * the scan continues until it finds one that does — a pincode is the one field
 * delivery cannot do without.
 */
export function parseGeocodeResponse(body: GeocodeResponse): ParsedGeocode {
  const status = body.status ?? "UNKNOWN_ERROR";
  if (status === "ZERO_RESULTS") return { kind: "no_pincode" };
  if (status !== "OK") return { kind: "provider_error", status };

  const results = body.results ?? [];
  const withPin = results.find((r) =>
    (r.address_components ?? []).some((c) => c.types.includes("postal_code") && PINCODE.test(c.long_name))
  );
  if (!withPin) return { kind: "no_pincode" };

  /* Pincode from the chosen result; the street detail from the most specific
     result overall, which may be a different one. */
  const pinComponents = withPin.address_components ?? [];
  const pincode = pick(pinComponents, "postal_code")!;
  const top = results[0]?.address_components ?? pinComponents;

  const locality =
    pick(top, "sublocality_level_1", "sublocality", "neighborhood") ??
    pick(pinComponents, "sublocality_level_1", "sublocality", "neighborhood");
  const city = pick(top, "locality") ?? pick(pinComponents, "locality", "administrative_area_level_2");
  const state = pick(top, "administrative_area_level_1") ?? pick(pinComponents, "administrative_area_level_1");

  const street = [
    pick(top, "premise", "street_number"),
    pick(top, "route"),
    pick(top, "sublocality_level_2", "sublocality_level_3"),
  ].filter((s): s is string => Boolean(s) && !/^[A-Z0-9]{4}\+[A-Z0-9]{2,}/.test(s!));

  return {
    kind: "found",
    address: {
      line1: [...new Set(street)].join(", "),
      locality,
      city,
      state,
      pincode,
    },
  };
}

/** Coordinates a person could plausibly be standing at. Not a service-area check. */
export function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
