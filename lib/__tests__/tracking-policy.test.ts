import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodePolyline, distanceToPathM, haversineM, validLatLng } from "@/lib/tracking/geo";
import {
  TRACKING_CONFIG,
  checkPing,
  etaMinutes,
  isStale,
  liveTrackingView,
  parseRoutesResponse,
  phaseFor,
  pingAllowed,
  routeDecision,
  shouldSample,
} from "@/lib/tracking/policy";

/**
 * The rules behind live tracking: what a driver's device may send, when we pay
 * Google for a route, and what a customer may be shown. All pure.
 */

const NOW = new Date("2026-10-07T10:00:00Z");
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow);
const ping = (over: Record<string, unknown> = {}) => ({
  latitude: 34.0837,
  longitude: 74.7973,
  accuracy: 12,
  heading: 90,
  speed: 6,
  timestamp: NOW.getTime() - 2_000,
  ...over,
});

/* Google's documented example: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453). */
const GOOGLE_EXAMPLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

test("polyline decoding matches Google's documented example, and rejects garbage", () => {
  const pts = decodePolyline(GOOGLE_EXAMPLE);
  assert.deepEqual(pts, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ]);
  assert.deepEqual(decodePolyline("_p~iF~ps|U_ulL"), [], "a truncated polyline is no path, not half of one");
  assert.deepEqual(decodePolyline("\u0001\u0002"), []);
});

test("distances: haversine and distance to a path", () => {
  // Lal Chowk to Dal Gate, Srinagar — roughly 2 km.
  const d = haversineM({ lat: 34.0697, lng: 74.8098 }, { lat: 34.0837, lng: 74.8307 });
  assert.ok(d > 2_300 && d < 2_600, `got ${d}`);
  const path = [{ lat: 34.0, lng: 74.8 }, { lat: 34.0, lng: 74.81 }];
  assert.ok(distanceToPathM({ lat: 34.0, lng: 74.805 }, path) < 1, "a point on the path is on it");
  const off = distanceToPathM({ lat: 34.001, lng: 74.805 }, path);
  assert.ok(off > 100 && off < 120, `~111 m north of the path, got ${off}`);
  assert.equal(distanceToPathM({ lat: 34, lng: 74 }, []), Infinity);
});

test("coordinate validation rejects out-of-range, non-finite and non-numbers", () => {
  assert.ok(validLatLng(34.08, 74.79));
  for (const [lat, lng] of [[91, 0], [0, 181], [NaN, 0], [Infinity, 0], ["34", 74], [null, null]] as const) {
    assert.equal(validLatLng(lat, lng), false, `${lat},${lng}`);
  }
});

test("a valid ping is accepted with its real heading and speed", () => {
  const v = checkPing(ping(), NOW);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.ping.heading, 90);
    assert.equal(v.ping.speed, 6);
    assert.equal(v.ping.timestamp.getTime(), NOW.getTime() - 2_000);
  }
});

test("a device's 'no heading' (-1, NaN) never becomes a bearing the marker rotates to", () => {
  for (const heading of [-1, NaN, 400, "90", null]) {
    const v = checkPing(ping({ heading }), NOW);
    assert.equal(v.ok, true);
    if (v.ok) assert.equal(v.ping.heading, null, `heading ${String(heading)}`);
  }
});

test("invalid coordinates, stale, future and imprecise pings are refused", () => {
  assert.deepEqual(checkPing(ping({ latitude: 95 }), NOW), { ok: false, reason: "invalid" });
  assert.deepEqual(checkPing(ping({ longitude: "74.79" }), NOW), { ok: false, reason: "invalid" });
  assert.deepEqual(checkPing(ping({ timestamp: "yesterday" }), NOW), { ok: false, reason: "invalid" });
  assert.deepEqual(checkPing(null, NOW), { ok: false, reason: "invalid" });
  assert.deepEqual(
    checkPing(ping({ timestamp: NOW.getTime() - TRACKING_CONFIG.maxPingAgeMs - 1 }), NOW),
    { ok: false, reason: "stale" }
  );
  assert.deepEqual(
    checkPing(ping({ timestamp: NOW.getTime() + TRACKING_CONFIG.maxPingFutureMs + 1 }), NOW),
    { ok: false, reason: "future" }
  );
  assert.deepEqual(checkPing(ping({ accuracy: 5_000 }), NOW), { ok: false, reason: "imprecise" });
  assert.equal(checkPing(ping({ timestamp: NOW.toISOString() }), NOW).ok, true, "ISO strings are accepted");
});

test("update rate and breadcrumb sampling", () => {
  assert.ok(pingAllowed(null, NOW));
  assert.equal(pingAllowed(at(-1_000), NOW), false);
  assert.ok(pingAllowed(at(-TRACKING_CONFIG.minPingIntervalMs), NOW));
  assert.ok(shouldSample(null, NOW));
  assert.equal(shouldSample(at(-10_000), NOW), false);
  assert.ok(shouldSample(at(-TRACKING_CONFIG.sampleEveryMs), NOW));
});

test("route refresh: none → fetch; too soon → never; expired or off-route → fetch; on-route and fresh → keep", () => {
  const route = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
  const onRoute = { lat: 38.5, lng: -120.2 };
  const offRoute = { lat: 30, lng: -100 };
  assert.deepEqual(routeDecision(onRoute, null, NOW), { refresh: true, why: "none" });
  assert.deepEqual(routeDecision(offRoute, { computedAt: at(-5_000), polyline: route }, NOW), { refresh: false, why: "too_soon" });
  assert.deepEqual(routeDecision(onRoute, { computedAt: at(-TRACKING_CONFIG.routeMaxAgeMs), polyline: route }, NOW), { refresh: true, why: "expired" });
  assert.deepEqual(routeDecision(offRoute, { computedAt: at(-30_000), polyline: route }, NOW), { refresh: true, why: "off_route" });
  assert.deepEqual(routeDecision(onRoute, { computedAt: at(-30_000), polyline: route }, NOW), { refresh: false, why: "fresh" });
  assert.deepEqual(routeDecision(onRoute, { computedAt: at(-30_000), polyline: null }, NOW), { refresh: true, why: "off_route" }, "a failed route is retried after the minimum interval");
});

test("Routes API responses are read exactly, and anything malformed is no route", () => {
  assert.deepEqual(
    parseRoutesResponse({ routes: [{ distanceMeters: 4211, duration: "734s", polyline: { encodedPolyline: GOOGLE_EXAMPLE } }] }),
    { distanceM: 4211, durationS: 734, polyline: GOOGLE_EXAMPLE }
  );
  /* Proto3 omits zeros: a driver at the gate gets no distanceMeters field. */
  assert.deepEqual(
    parseRoutesResponse({ routes: [{ duration: "0s", polyline: { encodedPolyline: "_p~iF~ps|U" } }] }),
    { distanceM: 0, durationS: 0, polyline: "_p~iF~ps|U" }
  );
  for (const body of [
    {},
    { routes: [{ distanceMeters: "4211", duration: "60s", polyline: { encodedPolyline: GOOGLE_EXAMPLE } }] },
    { routes: [] },
    { routes: [{ distanceMeters: 10, duration: "12 minutes", polyline: { encodedPolyline: GOOGLE_EXAMPLE } }] },
    { routes: [{ distanceMeters: -5, duration: "60s", polyline: { encodedPolyline: GOOGLE_EXAMPLE } }] },
    { routes: [{ distanceMeters: 10, duration: "60s", polyline: { encodedPolyline: "" } }] },
    null,
  ]) {
    assert.equal(parseRoutesResponse(body), null, JSON.stringify(body));
  }
});

test("ETA rounds up and is absent without a route; staleness after the configured window", () => {
  assert.equal(etaMinutes(734), 13);
  assert.equal(etaMinutes(10), 1, "never 'arriving in 0 min'");
  assert.equal(etaMinutes(null), null);
  assert.equal(isStale(at(-TRACKING_CONFIG.staleAfterMs - 1), NOW), true);
  assert.equal(isStale(at(-5_000), NOW), false);
});

test("tracking visibility follows the existing shipment statuses: live only on the road", () => {
  assert.equal(phaseFor("pending"), "preparing");
  assert.equal(phaseFor("packed"), "ready");
  assert.equal(phaseFor("out_for_delivery"), "live");
  assert.equal(phaseFor("delivered"), "delivered");
  assert.equal(phaseFor("cancelled"), "cancelled");
});

/* ------------------------------------------------------------------ what the customer sees */

const LIMITS = { staleAfterMs: 45_000, routeMaxAgeMs: 60_000 };
const T = Date.parse("2026-10-07T10:00:00Z");
const iso = (msBefore: number) => new Date(T - msBefore).toISOString();
const live = (driverAgo: number | null, routeAgo: number | null, durationS = 790) => ({
  phase: "live" as const,
  driver: driverAgo === null ? null : { recordedAt: iso(driverAgo) },
  route: routeAgo === null ? null : { distanceM: 3_250, durationS, computedAt: iso(routeAgo) },
});

test("fresh position + fresh route: the route's own ETA and distance, drawn as current", () => {
  const v = liveTrackingView(live(5_000, 10_000), T, LIMITS);
  assert.equal(v.state, "eta");
  assert.equal(v.headline, "Arriving in ~14 min"); // 790 s → 13.2 → rounded up
  assert.equal(v.distance, "3.3 km");
  assert.ok(v.riderCurrent && v.showRoute);
});

test("route unavailable: no time is made up — 'ETA updating', rider still current, no route line", () => {
  const v = liveTrackingView(live(5_000, null), T, LIMITS);
  assert.equal(v.state, "eta_updating");
  assert.equal(v.headline, "ETA updating");
  assert.equal(v.minutes, null);
  assert.equal(v.distance, null);
  assert.ok(v.riderCurrent);
  assert.ok(!v.showRoute);
});

test("an aged-out route is not an ETA, even with a fresh position", () => {
  const v = liveTrackingView(live(5_000, 61_000), T, LIMITS);
  assert.equal(v.state, "eta_updating");
  assert.equal(v.minutes, null);
});

test("stale position: 'Updating rider location…', no ETA, marker and route not shown as current", () => {
  for (const routeAgo of [null, 10_000]) {
    const v = liveTrackingView(live(46_000, routeAgo), T, LIMITS);
    assert.equal(v.state, "updating_location");
    assert.equal(v.headline, "Updating rider location…");
    assert.equal(v.minutes, null);
    assert.ok(!v.riderCurrent && !v.showRoute);
  }
});

test("staleness is judged on the viewer's clock: the same response goes stale as time passes", () => {
  const s = live(0, 0);
  assert.equal(liveTrackingView(s, T + 44_000, LIMITS).state, "eta");
  assert.equal(liveTrackingView(s, T + 46_000, LIMITS).state, "updating_location");
});

test("no position yet: a waiting state, never a route or an ETA", () => {
  const v = liveTrackingView(live(null, 10_000), T, LIMITS);
  assert.equal(v.state, "waiting_for_rider");
  assert.equal(v.minutes, null);
  assert.ok(!v.showRoute);
});

test("delivered, cancelled and not yet dispatched: no live ETA or position", () => {
  for (const [phase, state] of [["delivered", "delivered"], ["cancelled", "cancelled"], ["ready", "preparing"], ["preparing", "preparing"]] as const) {
    const v = liveTrackingView({ ...live(1_000, 1_000), phase }, T, LIMITS);
    assert.equal(v.state, state);
    assert.equal(v.minutes, null);
    assert.ok(!v.riderCurrent && !v.showRoute);
  }
});

test("network failure before anything loaded says so; a route at the gate is at least a minute", () => {
  assert.equal(liveTrackingView(undefined, T, LIMITS, { loaded: false, failed: true }).state, "unavailable");
  assert.equal(liveTrackingView(undefined, T, LIMITS, { loaded: false, failed: false }).state, "loading");
  assert.equal(liveTrackingView(live(1_000, 1_000, 0), T, LIMITS).headline, "Arriving in ~1 min");
  assert.equal(liveTrackingView({ ...live(1_000, 1_000), driver: { recordedAt: "garbage" } }, T, LIMITS).state, "updating_location");
});

test("the web tracking panel says only what liveTrackingView decides", () => {
  /* The card used to interpolate the route's minutes itself and so kept
     showing an ETA after the position had gone stale on the customer's clock. */
  const card = readFileSync(fileURLToPath(new URL("../../components/tracking/live-tracking-panel.tsx", import.meta.url)), "utf8");
  assert.match(card, /liveTrackingView\(/);
  assert.doesNotMatch(card, /etaMinutes|durationS/, "the card computes or prints minutes itself");
});
