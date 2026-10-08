import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LiveTrackingPanel } from "../live-tracking-panel";
import type { OrderTracking, ShipmentTracking } from "@/lib/services/tracking";

/**
 * The customer's live tracking card, through every state it can be in. The map
 * is unavailable here (no Google), which is itself one of the states: the
 * status panel must carry the delivery on its own.
 */

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(cleanup);

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ROUTE = { distanceM: 3_250, durationS: 790, etaMinutes: 14, polyline: "_p~iF~ps|U", computedAt: ago(5_000) };

function tracking(shipment: Partial<ShipmentTracking>): OrderTracking {
  return {
    orderNo: "VE-1",
    destination: { lat: 34.08, lng: 74.79 },
    pollMs: 20,
    staleAfterMs: 45_000,
    routeMaxAgeMs: 60_000,
    shipments: [{ id: "s1", sequence: 1, phase: "live", driverName: "Imran", driver: null, route: null, ...shipment }],
  };
}

async function mount(load: (orderNo: string) => Promise<{ ok: true; data: OrderTracking } | { ok: false }>, onFinished = () => {}) {
  await act(async () => {
    render(<LiveTrackingPanel orderNo="VE-1" shipmentId="s1" load={load} loadMaps={async () => null} onFinished={onFinished} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const fresh = { lat: 34.07, lng: 74.8, heading: null, recordedAt: ago(5_000), stale: false };

test("fresh position + route: route-derived ETA and distance", async () => {
  await mount(async () => ({ ok: true, data: tracking({ driver: fresh, route: ROUTE }) }));
  assert.ok(screen.getByText("Arriving in ~14 min"));
  assert.ok(screen.getByText("3.3 km"));
  assert.ok(screen.getByText(/The map isn't available right now/), "the status panel works without the map");
});

test("route unavailable: 'ETA updating', no distance, no time invented", async () => {
  await mount(async () => ({ ok: true, data: tracking({ driver: fresh, route: null }) }));
  assert.ok(screen.getByText("ETA updating"));
  assert.equal(screen.queryByText(/Arriving in/), null);
  assert.equal(screen.queryByText(/km$/), null);
});

test("stale position: 'Updating rider location…' even if a route came with it", async () => {
  await mount(async () => ({ ok: true, data: tracking({ driver: { ...fresh, recordedAt: ago(60_000) }, route: ROUTE }) }));
  assert.ok(screen.getByText("Updating rider location…"));
  assert.equal(screen.queryByText(/Arriving in/), null);
});

test("no position yet: a waiting state", async () => {
  await mount(async () => ({ ok: true, data: tracking({ driver: null }) }));
  assert.ok(screen.getByText("Waiting for the rider's location…"));
});

test("cannot load at all: says so and keeps retrying, no crash", async () => {
  let calls = 0;
  await mount(async () => {
    calls++;
    throw new Error("offline");
  });
  assert.ok(screen.getByText("Couldn't load tracking. Retrying…"));
  assert.ok(calls >= 1);
});

test("network lost after loading: last status stays, marked as retrying", async () => {
  let calls = 0;
  await mount(async () => {
    calls++;
    if (calls === 1) return { ok: true, data: tracking({ driver: fresh, route: ROUTE }) };
    throw new Error("offline");
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
  assert.ok(calls >= 2, "the poll used the server's pollMs, not a fixed 8 s");
  assert.ok(screen.getByText("Connection lost. Retrying…"));
  assert.ok(screen.getByText("Arriving in ~14 min"), "still current: the position is only seconds old");
});

test("delivered or cancelled: polling stops and the page is refreshed into its final state", async () => {
  let finished = 0;
  let calls = 0;
  await mount(async () => {
    calls++;
    return { ok: true, data: tracking({ phase: "delivered" }) };
  }, () => finished++);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
  assert.equal(finished, 1);
  assert.equal(calls, 1, "no further polls after the delivery ended");
});
