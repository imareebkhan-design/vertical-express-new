import "server-only";
import { reverseGeocode } from "@/lib/services/geocoding";
import { validCoordinates, type ParsedGeocode, type ResolvedAddress } from "@/lib/geocode-parse";
import { checkServiceability, type ServiceabilityResult } from "@/lib/services/serviceability";
import { rateLimit } from "@/lib/services/rate-limit";

/**
 * Device coordinates → a pincode, then whether we deliver there.
 *
 * Google answers WHERE; `ServiceablePincode` answers WHETHER. This is the one
 * place that joins them, so the native app (`/api/v1/location/reverse`, a
 * bearer token) and the web (`actions/location.ts`, the session cookie) get
 * the same answer — the rule `getAuthUserId` states for identity: a second
 * transport must not become a second answer.
 *
 * Signed-in callers only. Each lookup is a billed Google request, so it is
 * rate-limited per user, in one bucket shared by both transports, and the
 * limiter fails closed. There is no anonymous path: an anonymous visitor
 * types the pincode, which needs no Google at all.
 *
 * Every failure is a distinct kind and none of them guesses. A pincode the
 * geocoder did not return is never substituted — a wrong pincode quotes a
 * wrong delivery promise (see `lib/services/geocoding.ts`).
 */

export const GEOCODE_LIMIT = { hits: 20, windowMs: 60 * 1000 };

export type LocationLookup =
  | { kind: "found"; address: ResolvedAddress; serviceability: ServiceabilityResult }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "invalid_coordinates" }
  | { kind: "no_pincode" }
  | { kind: "provider_error"; status: string };

export async function lookUpLocation(
  userId: string,
  lat: number,
  lng: number,
  geocode: (lat: number, lng: number) => Promise<ParsedGeocode> = reverseGeocode
): Promise<LocationLookup> {
  const limit = await rateLimit(`api-geo:${userId}`, GEOCODE_LIMIT.hits, GEOCODE_LIMIT.windowMs, {
    failClosed: true,
  });
  if (!limit.allowed) return { kind: "rate_limited", retryAfterMs: limit.retryAfterMs };

  if (!validCoordinates(lat, lng)) return { kind: "invalid_coordinates" };

  const geo = await geocode(lat, lng);
  if (geo.kind !== "found") return geo;

  return { kind: "found", address: geo.address, serviceability: await checkServiceability(geo.address.pincode) };
}
