import "server-only";
import { parseGeocodeResponse, type ParsedGeocode } from "@/lib/geocode-parse";

/**
 * Reverse geocoding — coordinates to a street address and pincode — through
 * Google's Geocoding API.
 *
 * WHY ON THE SERVER
 *
 * The key is billed per request. A key in the app bundle can be lifted and
 * spent by anyone; a key here is reachable only through an authenticated,
 * rate-limited route. It is `GOOGLE_GEOCODING_API_KEY`, a Secret Manager value,
 * restricted in Google Cloud to the Geocoding API alone. It is never
 * `NEXT_PUBLIC_*` and never logged.
 *
 * WHEN IT IS NOT CONFIGURED
 *
 * The answer is `provider_error`, not a guess. The app then offers the manual
 * pincode path, which works without Google at all. There is deliberately no
 * "close enough to Srinagar, call it 190001" fallback: a wrong pincode quotes a
 * wrong delivery promise.
 */

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 5_000;

export function geocodingConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GEOCODING_API_KEY?.trim());
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch
): Promise<ParsedGeocode> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY?.trim();
  if (!key) return { kind: "provider_error", status: "NOT_CONFIGURED" };

  const url = new URL(ENDPOINT);
  url.searchParams.set("latlng", `${lat.toFixed(6)},${lng.toFixed(6)}`);
  url.searchParams.set("region", "in");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return { kind: "provider_error", status: `HTTP_${res.status}` };
    return parseGeocodeResponse(await res.json());
  } catch {
    /* The URL carries the key, so the error is not rethrown or logged with it. */
    return { kind: "provider_error", status: "NETWORK" };
  } finally {
    clearTimeout(timer);
  }
}
