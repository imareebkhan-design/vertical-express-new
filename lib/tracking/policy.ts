import { decodePolyline, distanceToPathM, haversineM, validLatLng, type LatLng } from "./geo";

/**
 * The rules of live delivery tracking, as pure functions.
 *
 * Every threshold is in `TRACKING_CONFIG` and can be overridden by environment
 * variable, because the right values are learnt from real deliveries, not
 * guessed once. None of them is a business promise: they govern how often we
 * write, poll and pay Google, never what a customer is told about time.
 */

function envMs(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const TRACKING_CONFIG = {
  /** A driver update arriving sooner than this after the last one is refused (429). The app sends every 5–10 s. */
  minPingIntervalMs: envMs("TRACKING_MIN_PING_INTERVAL_MS", 4_000),
  /** A fix older than this when it reaches us describes where the driver was, not is. */
  maxPingAgeMs: envMs("TRACKING_MAX_PING_AGE_MS", 120_000),
  /** Device clocks drift; a fix from further in the future than this is refused. */
  maxPingFutureMs: envMs("TRACKING_MAX_PING_FUTURE_MS", 30_000),
  /** A fix less precise than this would put the marker on the wrong street. */
  maxAccuracyM: envMs("TRACKING_MAX_ACCURACY_M", 1_000),
  /** One breadcrumb per this interval, not one per fix. */
  sampleEveryMs: envMs("TRACKING_SAMPLE_EVERY_MS", 30_000),
  /** After this, the customer sees "Updating rider location…" instead of a position. */
  staleAfterMs: envMs("TRACKING_STALE_AFTER_MS", 45_000),
  /** Route/ETA is recomputed at most this often, however the driver moves… */
  routeMinIntervalMs: envMs("TRACKING_ROUTE_MIN_INTERVAL_MS", 20_000),
  /** …and at least this often while someone is watching. */
  routeMaxAgeMs: envMs("TRACKING_ROUTE_MAX_AGE_MS", 60_000),
  /** Further than this from the cached route counts as having left it. */
  offRouteM: envMs("TRACKING_OFF_ROUTE_M", 120),
  /** How often the customer's screen asks for a new position. */
  customerPollMs: envMs("TRACKING_CUSTOMER_POLL_MS", 8_000),
};
export type TrackingConfig = typeof TRACKING_CONFIG;

/* ------------------------------------------------------------------ pings */

export interface PingInput {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  /** When the device took the fix. */
  timestamp: Date;
}

export type PingVerdict =
  | { ok: true; ping: PingInput }
  | { ok: false; reason: "invalid" | "stale" | "future" | "imprecise" };

/**
 * Parses and checks a driver's location body. Anything not a plain, finite,
 * in-range number is refused; heading and speed are kept only when they are
 * real (a device reports -1 or NaN when it has none) so the customer's marker
 * never rotates on a made-up bearing.
 */
export function checkPing(body: unknown, now: Date, cfg: TrackingConfig = TRACKING_CONFIG): PingVerdict {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid" };
  const b = body as Record<string, unknown>;
  if (!validLatLng(b.latitude, b.longitude)) return { ok: false, reason: "invalid" };

  const ts = typeof b.timestamp === "number" ? b.timestamp : typeof b.timestamp === "string" ? Date.parse(b.timestamp) : NaN;
  if (!Number.isFinite(ts)) return { ok: false, reason: "invalid" };
  const age = now.getTime() - ts;
  if (age > cfg.maxPingAgeMs) return { ok: false, reason: "stale" };
  if (-age > cfg.maxPingFutureMs) return { ok: false, reason: "future" };

  const finiteOrNull = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
  const accuracy = finiteOrNull(b.accuracy, 0, Number.MAX_SAFE_INTEGER);
  if (accuracy !== null && accuracy > cfg.maxAccuracyM) return { ok: false, reason: "imprecise" };

  return {
    ok: true,
    ping: {
      latitude: b.latitude as number,
      longitude: b.longitude as number,
      accuracy,
      heading: finiteOrNull(b.heading, 0, 360),
      speed: finiteOrNull(b.speed, 0, 100),
      timestamp: new Date(ts),
    },
  };
}

/** Whether a new update for this shipment may be written now. */
export function pingAllowed(lastReceivedAt: Date | null, now: Date, cfg: TrackingConfig = TRACKING_CONFIG): boolean {
  return lastReceivedAt === null || now.getTime() - lastReceivedAt.getTime() >= cfg.minPingIntervalMs;
}

/** Whether this update should also become a breadcrumb. */
export function shouldSample(lastSampledAt: Date | null, now: Date, cfg: TrackingConfig = TRACKING_CONFIG): boolean {
  return lastSampledAt === null || now.getTime() - lastSampledAt.getTime() >= cfg.sampleEveryMs;
}

/* ------------------------------------------------------------------ route */

export interface CachedRoute {
  computedAt: Date;
  polyline: string | null;
}

export type RouteDecision =
  | { refresh: false; why: "fresh" | "too_soon" }
  | { refresh: true; why: "none" | "expired" | "off_route" };

/**
 * When to ask Google for a new route. Never on every update: only when there is
 * no route, the cached one has aged out, or the driver has left it — and even
 * then not twice inside `routeMinIntervalMs`.
 */
export function routeDecision(
  driver: LatLng,
  cached: CachedRoute | null,
  now: Date,
  cfg: TrackingConfig = TRACKING_CONFIG
): RouteDecision {
  if (!cached) return { refresh: true, why: "none" };
  const age = now.getTime() - cached.computedAt.getTime();
  if (age < cfg.routeMinIntervalMs) return { refresh: false, why: "too_soon" };
  if (age >= cfg.routeMaxAgeMs) return { refresh: true, why: "expired" };
  const path = cached.polyline ? decodePolyline(cached.polyline) : [];
  if (distanceToPathM(driver, path) > cfg.offRouteM) return { refresh: true, why: "off_route" };
  return { refresh: false, why: "fresh" };
}

/* ------------------------------------------------------------------ Routes API */

export interface RouteResult {
  distanceM: number;
  durationS: number;
  polyline: string;
}

/**
 * Reads a Routes API `computeRoutes` response. The duration arrives as a string
 * of seconds ("734s"). Anything missing or malformed is null — a route we
 * cannot read is no route, never a guessed one.
 */
export function parseRoutesResponse(body: unknown): RouteResult | null {
  const route = (body as { routes?: unknown[] } | null)?.routes?.[0] as
    | { distanceMeters?: unknown; duration?: unknown; polyline?: { encodedPolyline?: unknown } }
    | undefined;
  if (!route) return null;
  /* Proto3 JSON omits zero values: a driver already at the gate gets a route
     with no `distanceMeters` at all. Absent is 0; present-but-wrong is refused. */
  const distanceM = route.distanceMeters === undefined ? 0 : route.distanceMeters;
  const duration = typeof route.duration === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(route.duration) : null;
  const polyline = route.polyline?.encodedPolyline;
  if (typeof distanceM !== "number" || !Number.isFinite(distanceM) || distanceM < 0) return null;
  if (!duration || typeof polyline !== "string" || decodePolyline(polyline).length < 1) return null;
  return { distanceM: Math.round(distanceM), durationS: Math.round(Number(duration[1])), polyline };
}

/* ------------------------------------------------------------------ customer view */

export type ShipmentPhase = "preparing" | "ready" | "live" | "delivered" | "cancelled";

/** Maps the existing shipment statuses to what the tracking screen may show. No parallel status set. */
export function phaseFor(status: "pending" | "packed" | "out_for_delivery" | "delivered" | "cancelled"): ShipmentPhase {
  switch (status) {
    case "pending":
      return "preparing";
    case "packed":
      return "ready";
    case "out_for_delivery":
      return "live";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "cancelled";
  }
}

/** "Arriving in ~12 min" — rounded up, never below one minute. Null without a route. */
export function etaMinutes(durationS: number | null): number | null {
  if (durationS === null || !Number.isFinite(durationS) || durationS < 0) return null;
  return Math.max(1, Math.ceil(durationS / 60));
}

export function isStale(recordedAt: Date, now: Date, cfg: TrackingConfig = TRACKING_CONFIG): boolean {
  return now.getTime() - recordedAt.getTime() > cfg.staleAfterMs;
}

export { haversineM };

/* ------------------------------------------------------------------ what the customer sees */

/** The freshness limits the server sends with every tracking response. */
export interface FreshnessLimits {
  staleAfterMs: number;
  routeMaxAgeMs: number;
}

export interface LiveShipmentInput {
  phase: ShipmentPhase;
  driver: { recordedAt: string } | null;
  route: { distanceM: number; durationS: number; computedAt: string } | null;
}

export type LiveState =
  | "loading"
  | "unavailable"
  | "preparing"
  | "waiting_for_rider"
  | "updating_location"
  | "eta"
  | "eta_updating"
  | "delivered"
  | "cancelled";

export interface LiveView {
  state: LiveState;
  headline: string;
  /** Route-derived minutes, only in state "eta". */
  minutes: number | null;
  /** "3.3 km", only in state "eta". */
  distance: string | null;
  /** Whether the rider marker describes where the rider is now. */
  riderCurrent: boolean;
  /** Whether the route line may be drawn as the current route. */
  showRoute: boolean;
}

/**
 * Everything the live tracking panel says, decided in one place.
 *
 * Re-evaluated on the viewer's own clock every second, so a position or a
 * route that ages out while the network is down stops being presented as
 * current — the screen does not wait for a server that may never answer.
 *
 * An ETA appears only when there is a route from the Routes API, computed from
 * a fresh position within `routeMaxAgeMs`. Nothing is estimated, defaulted or
 * carried forward: without that, the text says the ETA is updating.
 */
export function liveTrackingView(
  s: LiveShipmentInput | undefined,
  nowMs: number,
  limits: FreshnessLimits,
  opts: { loaded: boolean; failed: boolean } = { loaded: true, failed: false }
): LiveView {
  const none = { minutes: null, distance: null, riderCurrent: false, showRoute: false };
  if (!opts.loaded || !s) {
    return opts.failed
      ? { state: "unavailable", headline: "Couldn't load tracking. Retrying…", ...none }
      : { state: "loading", headline: "Loading live tracking…", ...none };
  }
  if (s.phase === "delivered") return { state: "delivered", headline: "Delivered", ...none };
  if (s.phase === "cancelled") return { state: "cancelled", headline: "Cancelled", ...none };
  if (s.phase !== "live") return { state: "preparing", headline: "Getting your order ready", ...none };
  if (!s.driver) return { state: "waiting_for_rider", headline: "Waiting for the rider's location…", ...none };

  const recorded = Date.parse(s.driver.recordedAt);
  if (!Number.isFinite(recorded) || nowMs - recorded > limits.staleAfterMs) {
    return { state: "updating_location", headline: "Updating rider location…", ...none };
  }

  const route = s.route;
  const computed = route ? Date.parse(route.computedAt) : NaN;
  const routeFresh = route !== null && Number.isFinite(computed) && nowMs - computed <= limits.routeMaxAgeMs;
  const minutes = route && routeFresh ? etaMinutes(route.durationS) : null;
  if (!route || minutes === null) {
    return { state: "eta_updating", headline: "ETA updating", minutes: null, distance: null, riderCurrent: true, showRoute: false };
  }
  return {
    state: "eta",
    headline: `Arriving in ~${minutes} min`,
    minutes,
    distance: `${(route.distanceM / 1000).toFixed(1)} km`,
    riderCurrent: true,
    showRoute: true,
  };
}
