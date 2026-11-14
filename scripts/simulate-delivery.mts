/**
 * Delivery tracking simulator — DEV AND STAGING ONLY.
 *
 * Drives one order's first shipment through a real delivery without a phone in
 * a car: assigns a simulator driver, starts the delivery, then writes positions
 * along a route to the customer's delivery pin through exactly the code path
 * the driver app uses (`recordDriverLocation`), so every validation, rate limit
 * and route rule is exercised for real. Optionally pauses (to show the stale
 * state) and finishes by delivering with the shipment's code.
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --import tsx \
 *     scripts/simulate-delivery.mts --expect-ref=localhost --order=<orderNo> \
 *     [--interval=6000] [--points=25] [--start-km=3] [--pause-at=10 --pause-ms=60000] [--deliver]
 *
 * The path follows real roads when GOOGLE_ROUTES_API_KEY is set (one Routes API
 * request), otherwise a straight line — labelled as such. It is a simulation
 * either way and is never a production feature: there is no route, page or
 * button for it, and it refuses the production database (same guard as
 * scripts/import-product-images.mts). Never prints the connection string.
 */
import { existsSync, readFileSync } from "node:fs";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string) => process.argv.includes(`--${name}`);

function ref(url: string | undefined): string {
  try {
    const u = new URL(url ?? "");
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return "localhost";
    return (decodeURIComponent(u.username) + " " + u.hostname).match(/[a-z]{20}/)?.[0] ?? "";
  } catch {
    return "";
  }
}
function refuse(why: string): never {
  process.stderr.write(`REFUSING: ${why}\n`);
  process.exit(1);
}

const expect = arg("expect-ref");
const target = ref(process.env.DATABASE_URL);
if (!expect) refuse("pass --expect-ref=<project ref> (or localhost) naming the database you mean to write");
if (!target || target !== expect) refuse(`DATABASE_URL does not belong to ${expect}`);
const prodRefs = new Set<string>();
if (existsSync(".env")) prodRefs.add(ref(readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)/m)?.[1]));
if (existsSync("supabase/config.toml")) prodRefs.add(readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? "");
prodRefs.delete("");
if (prodRefs.has(target)) refuse(`${target} is the production project`);

const orderNo = arg("order") ?? refuse("pass --order=<orderNo>");
const intervalMs = Number(arg("interval") ?? 6000);
const points = Math.max(2, Number(arg("points") ?? 25));
const startKm = Number(arg("start-km") ?? 3);
const pauseAt = arg("pause-at") === undefined ? -1 : Number(arg("pause-at"));
const pauseMs = Number(arg("pause-ms") ?? 60_000);

const { db } = await import("@/lib/db");
const { assignShipment, advanceShipment, confirmDelivery } = await import("@/lib/services/admin/shipments-write");
const { recordDriverLocation } = await import("@/lib/services/tracking");
const { computeDrivingRoute } = await import("@/lib/services/routes");
const { decodePolyline, haversineM } = await import("@/lib/tracking/geo");
type LatLng = { lat: number; lng: number };

const SIM_PHONE = "+910000000099";
const SIM_NAME = "Simulator Rider (test)";
const actor = { id: "00000000-0000-0000-0000-000000000000", email: "simulator@localhost" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => process.stdout.write(`[sim ${new Date().toISOString().slice(11, 19)}] ${msg}\n`);

const order = await db.order.findUnique({
  where: { orderNo },
  select: { address: true, shipments: { orderBy: { sequence: "asc" }, take: 1, select: { id: true, status: true, driverId: true } } },
});
if (!order) refuse(`order ${orderNo} not found`);
const shipment = order.shipments[0] ?? refuse(`order ${orderNo} has no shipment`);
const a = order.address as { latitude?: number; longitude?: number };
if (typeof a.latitude !== "number" || typeof a.longitude !== "number") refuse("the order's address has no delivery pin (latitude/longitude)");
const dest: LatLng = { lat: a.latitude, lng: a.longitude };

const driver =
  (await db.driver.findUnique({ where: { phone: SIM_PHONE }, select: { id: true, name: true } })) ??
  (await db.driver.create({ data: { name: SIM_NAME, phone: SIM_PHONE }, select: { id: true, name: true } }));
const identity = { driverId: driver.id, name: driver.name };

if (shipment.status === "pending") {
  const r = await advanceShipment({ shipmentId: shipment.id, to: "packed", actor });
  if (!r.ok) refuse(`could not pack: ${r.reason}`);
  log("packed");
}
if (shipment.status === "pending" || shipment.status === "packed") {
  if (shipment.driverId !== driver.id) {
    const r = await assignShipment({ shipmentId: shipment.id, driverId: driver.id, actor });
    if (!r.ok) refuse(`could not assign: ${r.reason}`);
  }
  const r = await advanceShipment({ shipmentId: shipment.id, to: "out_for_delivery", actor, actorType: "driver", requireDriverId: driver.id });
  if (!r.ok) refuse(`could not start: ${r.reason}`);
  log("out for delivery");
} else if (shipment.status !== "out_for_delivery" || shipment.driverId !== driver.id) {
  refuse(`shipment is ${shipment.status}${shipment.driverId !== driver.id ? " with another driver" : ""}; nothing to simulate`);
}

/* A start point `startKm` south-west of the customer, then a path to them. */
const start: LatLng = { lat: dest.lat - startKm / 111 / Math.SQRT2, lng: dest.lng - startKm / (111 * Math.cos((dest.lat * Math.PI) / 180)) / Math.SQRT2 };
const routed = await computeDrivingRoute(start, dest);
let path: LatLng[] = routed ? decodePolyline(routed.polyline) : [start, dest];
log(routed ? `following a real road route, ${routed.distanceM} m` : "no Routes key: STRAIGHT-LINE path (simulation only)");

/* Resample to `points` evenly spaced positions along the path. */
function resample(p: LatLng[], count: number): LatLng[] {
  const legs = p.slice(1).map((q, i) => haversineM(p[i], q));
  const total = legs.reduce((x, y) => x + y, 0);
  const out: LatLng[] = [];
  for (let k = 0; k < count; k++) {
    let want = (total * k) / (count - 1);
    let i = 0;
    while (i < legs.length - 1 && want > legs[i]) want -= legs[i++];
    const t = legs[i] === 0 ? 0 : Math.min(1, want / legs[i]);
    out.push({ lat: p[i].lat + (p[i + 1].lat - p[i].lat) * t, lng: p[i].lng + (p[i + 1].lng - p[i].lng) * t });
  }
  return out;
}
path = resample(path, points);

const bearing = (p: LatLng, q: LatLng) => {
  const y = Math.sin(((q.lng - p.lng) * Math.PI) / 180) * Math.cos((q.lat * Math.PI) / 180);
  const x = Math.cos((p.lat * Math.PI) / 180) * Math.sin((q.lat * Math.PI) / 180) - Math.sin((p.lat * Math.PI) / 180) * Math.cos((q.lat * Math.PI) / 180) * Math.cos(((q.lng - p.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

for (let i = 0; i < path.length; i++) {
  if (i === pauseAt) {
    log(`pausing ${pauseMs} ms — the customer should see "Updating rider location…"`);
    await sleep(pauseMs);
  }
  const p = path[i];
  const next = path[Math.min(i + 1, path.length - 1)];
  const res = await recordDriverLocation(identity, shipment.id, {
    latitude: p.lat,
    longitude: p.lng,
    accuracy: 8,
    heading: i < path.length - 1 ? bearing(p, next) : null,
    speed: 7,
    timestamp: Date.now(),
  });
  log(`point ${i + 1}/${path.length} ${p.lat.toFixed(5)},${p.lng.toFixed(5)} → ${res.ok ? "accepted" : res.reason}`);
  if (!res.ok && res.reason === "not_trackable") break;
  if (i < path.length - 1) await sleep(intervalMs);
}

if (flag("deliver")) {
  const code = (await db.shipment.findUnique({ where: { id: shipment.id }, select: { deliveryCode: true } }))?.deliveryCode;
  const r = code ? await confirmDelivery({ shipmentId: shipment.id, code, actor, actorType: "driver", requireDriverId: driver.id }) : { ok: false };
  log(r.ok ? "delivered — tracking stopped" : "could not deliver");
}
await db.$disconnect();
