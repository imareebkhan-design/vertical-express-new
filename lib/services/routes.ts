import "server-only";
import { parseRoutesResponse, type RouteResult } from "@/lib/tracking/policy";
import type { LatLng } from "@/lib/tracking/geo";

/**
 * Driving route, distance and duration from the driver to the customer, via the
 * Routes API `computeRoutes`.
 *
 * Server-side only, for the same reason geocoding and Places are: the key is
 * billed per request. It is `GOOGLE_ROUTES_API_KEY`, a Secret Manager value
 * restricted in Google Cloud to the Routes API alone, never `NEXT_PUBLIC_*`,
 * never logged (it travels in a header, not the URL).
 *
 * The field mask asks for three fields and nothing else; a wider mask costs
 * the same request a higher SKU. Traffic-aware routing is the Pro SKU —
 * `GOOGLE_ROUTES_PREFERENCE=TRAFFIC_UNAWARE` drops to Essentials if cost
 * matters more than a traffic-adjusted ETA. TRAFFIC_AWARE_OPTIMAL (Enterprise)
 * is not offered: it is not worth its price for a city delivery.
 *
 * Unconfigured, failing or unreadable: null. The tracking screen then shows the
 * driver without an ETA — never an invented one.
 */

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 5_000;

export function routesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_ROUTES_API_KEY?.trim());
}

function preference(): "TRAFFIC_AWARE" | "TRAFFIC_UNAWARE" {
  return process.env.GOOGLE_ROUTES_PREFERENCE === "TRAFFIC_UNAWARE" ? "TRAFFIC_UNAWARE" : "TRAFFIC_AWARE";
}

export async function computeDrivingRoute(
  origin: LatLng,
  destination: LatLng,
  fetchImpl: typeof fetch = fetch
): Promise<RouteResult | null> {
  const key = process.env.GOOGLE_ROUTES_API_KEY?.trim();
  if (!key) return null;

  const pref = preference();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: point(origin),
        destination: point(destination),
        travelMode: "DRIVE",
        routingPreference: pref,
        languageCode: "en-IN",
        units: "METRIC",
      }),
    });
    /* Structured, key-free usage line for Cloud Logging — one per billed request. */
    console.info(JSON.stringify({ event: "routes.compute", preference: pref, status: res.status }));
    if (!res.ok) return null;
    return parseRoutesResponse(await res.json());
  } catch {
    console.info(JSON.stringify({ event: "routes.compute", preference: pref, status: "network_error" }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
