/**
 * A place a customer might deliver to — what the location sheet shows for
 * confirmation and, once confirmed, what the site remembers.
 *
 * Only what is useful is kept: a short label, the formatted line, pincode,
 * locality/city, coordinates and (from search) the Google place id. Nothing
 * else from Google's response is stored; place ids are the one field Google's
 * terms allow keeping indefinitely, and coordinates are the customer's own
 * confirmed pin.
 */
export interface DeliveryCandidate {
  label: string;
  formattedAddress: string;
  pincode: string;
  locality: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  placeId: string | null;
  serviceable: boolean;
}

/** "Rajbagh", else the street line, else the city — what the header says after "Deliver to". */
export function labelFor(a: { line1: string; locality: string | null; city: string | null; pincode: string }): string {
  return a.locality?.trim() || a.line1?.trim() || a.city?.trim() || a.pincode;
}

export function formattedFor(a: { line1: string; locality: string | null; city: string | null; pincode: string }): string {
  const parts = [a.line1, a.locality, a.city].map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return `${unique.join(", ")}${unique.length ? " " : ""}${a.pincode}`.trim();
}
