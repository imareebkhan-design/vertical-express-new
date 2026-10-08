import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import {
  handleDriverDeliver,
  handleDriverLocation,
  handleDriverShipments,
  handleDriverStart,
  handleOrderTracking,
} from "@/lib/api/tracking";
import { assignShipment } from "@/lib/services/admin/shipments-write";
import { getOrderTracking } from "@/lib/services/tracking";
import { TRACKING_CONFIG, type RouteResult } from "@/lib/tracking/policy";

/**
 * Live delivery tracking, end to end through the HTTP handlers against a real
 * database: who may send a position, who may read one, and that a finished
 * delivery has none.
 */

const tag = randomUUID().slice(0, 8);
const ORDER_PREFIX = `zzz-trk-${tag}`;
const phone = () => `+9198${String(Math.random()).slice(2, 10)}`;

/* Identities. Customers carry only a uid; drivers carry a verified phone. */
const C_OWNER = { uid: `uid-trk-owner-${tag}` };
const C_OTHER = { uid: `uid-trk-other-${tag}` };
const D_ONE = { uid: `uid-trk-d1-${tag}`, phone_number: phone() };
const D_TWO = { uid: `uid-trk-d2-${tag}`, phone_number: phone() };
const D_IMPOSTOR = { uid: `uid-trk-imp-${tag}`, phone_number: D_ONE.phone_number };
const TOKENS: Record<string, object> = { owner: C_OWNER, other: C_OTHER, d1: D_ONE, d2: D_TWO, impostor: D_IMPOSTOR };
const verify = async (t: string) => (TOKENS[t] ? (TOKENS[t] as DecodedIdToken) : null);

const DEST = { lat: 34.0837, lng: 74.7973 };
let warehouseId: string;
let ownerId: string;
let otherId: string;
let driverOne: string;
let driverTwo: string;

function req(method: string, token?: string, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/x", { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function json(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const ping = (now: Date, over: Record<string, unknown> = {}) => ({
  latitude: 34.07,
  longitude: 74.81,
  accuracy: 10,
  heading: 45,
  speed: 5,
  timestamp: now.getTime() - 1_000,
  ...over,
});

let n = 0;
async function scratchOrder(opts: { driverId?: string; destination?: boolean } = {}) {
  const order = await db.order.create({
    data: {
      orderNo: `${ORDER_PREFIX}-${n++}`,
      userId: ownerId,
      status: "confirmed",
      subtotalPaise: 10000,
      totalPaise: 10000,
      paymentMethod: "razorpay",
      warehouseId,
      address: {
        name: "Bilal",
        phone: "+919800000000",
        line1: "12 Link Road",
        city: "Srinagar",
        pincode: "190005",
        ...(opts.destination === false ? {} : { latitude: DEST.lat, longitude: DEST.lng }),
      },
    },
  });
  const shipment = await db.shipment.create({
    data: { orderId: order.id, sequence: 1, speedClass: "express", status: "packed", warehouseId },
  });
  if (opts.driverId) {
    const r = await assignShipment({ shipmentId: shipment.id, driverId: opts.driverId, actor: { id: ownerId, email: "zzz@demo.invalid" } });
    assert.equal(r.ok, true);
  }
  return { orderNo: order.orderNo, shipmentId: shipment.id };
}

before(async () => {
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ TRK ${tag}`, city: "Srinagar", pincode: "190001" } })).id;
  const mkUser = async (uid: string) =>
    (await db.user.create({ data: { id: randomUUID(), firebaseUid: uid, profile: { create: {} } }, select: { id: true } })).id;
  ownerId = await mkUser(C_OWNER.uid);
  otherId = await mkUser(C_OTHER.uid);
  driverOne = (await db.driver.create({ data: { name: "ZZZ TRK Rider One", phone: D_ONE.phone_number } })).id;
  driverTwo = (await db.driver.create({ data: { name: "ZZZ TRK Rider Two", phone: D_TWO.phone_number } })).id;
});

after(async () => {
  const ships = await db.shipment.findMany({ where: { order: { orderNo: { startsWith: ORDER_PREFIX } } }, select: { id: true } });
  await db.auditLog.deleteMany({ where: { entityType: "shipment", entityId: { in: ships.map((s) => s.id) } } });
  await db.order.deleteMany({ where: { orderNo: { startsWith: ORDER_PREFIX } } });
  await db.driver.deleteMany({ where: { id: { in: [driverOne, driverTwo] } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

/* ------------------------------------------------------------------ driver identity */

test("only an active roster driver, by verified phone, reaches the driver API", async () => {
  assert.equal((await handleDriverShipments(req("GET"), verify)).status, 401, "no token");
  assert.equal((await handleDriverShipments(req("GET", "forged"), verify)).status, 401, "bad token");
  assert.equal((await handleDriverShipments(req("GET", "owner"), verify)).status, 403, "a customer is not a driver");
  const ok = await json(await handleDriverShipments(req("GET", "d1"), verify));
  assert.equal(ok.status, 200);
  const pinned = await db.driver.findUnique({ where: { id: driverOne }, select: { firebaseUid: true } });
  assert.equal(pinned?.firebaseUid, D_ONE.uid, "the first account is pinned to the driver");
  assert.equal(
    (await handleDriverShipments(req("GET", "impostor"), verify)).status,
    403,
    "another account with the same number is refused once one is pinned"
  );
});

test("a driver sees only their own assigned deliveries, with no delivery code", async () => {
  const mine = await scratchOrder({ driverId: driverOne });
  const theirs = await scratchOrder({ driverId: driverTwo });
  const list = await json(await handleDriverShipments(req("GET", "d1"), verify));
  const ids = list.body.data.shipments.map((s: { id: string }) => s.id);
  assert.ok(ids.includes(mine.shipmentId));
  assert.equal(ids.includes(theirs.shipmentId), false);
  assert.equal(JSON.stringify(list.body).includes("deliveryCode"), false);
  assert.deepEqual(list.body.data.shipments.find((s: { id: string }) => s.id === mine.shipmentId).destination, DEST);
});

/* ------------------------------------------------------------------ start + location */

test("only the assigned driver can start a delivery, and the code is not handed to them", async () => {
  const s = await scratchOrder({ driverId: driverOne });
  assert.equal((await handleDriverStart(req("POST", "d2"), s.shipmentId, verify)).status, 404, "another driver");
  const started = await json(await handleDriverStart(req("POST", "d1"), s.shipmentId, verify));
  assert.equal(started.status, 200);
  assert.equal(started.body.data.status, "out_for_delivery");
  assert.equal(JSON.stringify(started.body).match(/\d{6}/), null, "no delivery code in the response");
  const audit = await db.auditLog.findFirst({ where: { entityId: s.shipmentId, action: "shipment.status_changed" }, orderBy: { createdAt: "desc" } });
  assert.equal(audit?.actorType, "driver");
});

test("location updates: assigned driver only, validated, rate-limited, sampled", async () => {
  const s = await scratchOrder({ driverId: driverOne });
  const t0 = new Date();
  /* Not yet on the road. */
  assert.equal((await handleDriverLocation(req("POST", "d1", ping(t0)), s.shipmentId, verify, t0)).status, 409);
  await handleDriverStart(req("POST", "d1"), s.shipmentId, verify);

  assert.equal((await handleDriverLocation(req("POST", "d2", ping(t0)), s.shipmentId, verify, t0)).status, 404, "another driver cannot move this marker");
  assert.equal((await handleDriverLocation(req("POST", "owner", ping(t0)), s.shipmentId, verify, t0)).status, 403);
  assert.equal((await handleDriverLocation(req("POST", "d1", ping(t0, { latitude: 120 })), s.shipmentId, verify, t0)).status, 400);
  assert.equal(
    (await handleDriverLocation(req("POST", "d1", ping(t0, { timestamp: t0.getTime() - TRACKING_CONFIG.maxPingAgeMs - 5_000 })), s.shipmentId, verify, t0)).status,
    400,
    "a stale fix"
  );

  const first = await json(await handleDriverLocation(req("POST", "d1", ping(t0)), s.shipmentId, verify, t0));
  assert.equal(first.status, 200);
  assert.equal(first.body.data.sampled, true);
  const tooSoon = new Date(t0.getTime() + 1_000);
  assert.equal((await handleDriverLocation(req("POST", "d1", ping(tooSoon)), s.shipmentId, verify, tooSoon)).status, 429);
  const t1 = new Date(t0.getTime() + TRACKING_CONFIG.minPingIntervalMs);
  const second = await json(await handleDriverLocation(req("POST", "d1", ping(t1, { latitude: 34.071 })), s.shipmentId, verify, t1));
  assert.equal(second.status, 200);
  assert.equal(second.body.data.sampled, false, "one breadcrumb per sampling interval, not per fix");

  const live = await db.shipmentLiveLocation.findUnique({ where: { shipmentId: s.shipmentId } });
  assert.equal(live?.latitude, 34.071, "the latest position overwrites the row");
  assert.equal(await db.shipmentLocationSample.count({ where: { shipmentId: s.shipmentId } }), 1);
});

/* ------------------------------------------------------------------ customer read */

test("a customer reads their own order's tracking; anyone else gets 404", async () => {
  const s = await scratchOrder({ driverId: driverOne });
  assert.equal((await handleOrderTracking(req("GET"), s.orderNo, { verify })).status, 401);
  assert.equal((await handleOrderTracking(req("GET", "other"), s.orderNo, { verify })).status, 404);
  const ready = await json(await handleOrderTracking(req("GET", "owner"), s.orderNo, { verify, tracking: { routesEnabled: false } }));
  assert.equal(ready.status, 200);
  assert.equal(ready.body.data.shipments[0].phase, "ready");
  assert.equal(ready.body.data.shipments[0].driver, null, "no position before the delivery starts");
  assert.equal(JSON.stringify(ready.body).includes("phone"), false, "no phone numbers in the customer's tracking");
});

test("route: computed once, reused inside the interval, absent on failure, never from a stale fix", async () => {
  const s = await scratchOrder({ driverId: driverOne });
  await handleDriverStart(req("POST", "d1"), s.shipmentId, verify);
  const t0 = new Date();
  await handleDriverLocation(req("POST", "d1", ping(t0)), s.shipmentId, verify, t0);

  let calls = 0;
  const good = async (): Promise<RouteResult> => {
    calls++;
    return { distanceM: 3200, durationS: 610, polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" };
  };
  const viewer = { kind: "customer" as const, userId: ownerId };

  const a = await getOrderTracking(viewer, s.orderNo, t0, { route: good, routesEnabled: true });
  assert.equal(calls, 1);
  assert.equal(a?.shipments[0].route?.etaMinutes, 11);
  assert.equal(a?.shipments[0].route?.distanceM, 3200);
  const b = await getOrderTracking(viewer, s.orderNo, new Date(t0.getTime() + 5_000), { route: good, routesEnabled: true });
  assert.equal(calls, 1, "a second viewer inside the interval does not pay for another route");
  assert.equal(b?.shipments[0].route?.durationS, 610);

  const failing = async () => null;
  const later = new Date(t0.getTime() + TRACKING_CONFIG.routeMaxAgeMs + 1_000);
  await handleDriverLocation(req("POST", "d1", ping(later)), s.shipmentId, verify, later);
  const c = await getOrderTracking(viewer, s.orderNo, later, { route: failing, routesEnabled: true });
  assert.equal(c?.shipments[0].route, null, "a failed refresh shows no ETA rather than an expired one");
  assert.ok(c?.shipments[0].driver, "the driver is still shown");

  const muchLater = new Date(later.getTime() + TRACKING_CONFIG.staleAfterMs + 30_000);
  const before = calls;
  const d = await getOrderTracking(viewer, s.orderNo, muchLater, { route: good, routesEnabled: true });
  assert.equal(d?.shipments[0].driver?.stale, true, "an old fix is marked stale");
  assert.equal(calls, before, "no route is computed from a stale position");
});

test("a cached route is never served for a stale rider, nor once it has aged out", async () => {
  const s = await scratchOrder({ driverId: driverOne });
  await handleDriverStart(req("POST", "d1"), s.shipmentId, verify);
  const t0 = new Date();
  await handleDriverLocation(req("POST", "d1", ping(t0)), s.shipmentId, verify, t0);
  const viewer = { kind: "customer" as const, userId: ownerId };
  const good = async (): Promise<RouteResult> => ({ distanceM: 3200, durationS: 610, polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" });

  const fresh = await getOrderTracking(viewer, s.orderNo, t0, { route: good, routesEnabled: true });
  assert.ok(fresh?.shipments[0].route, "a fresh position gets its route");
  assert.equal(fresh?.staleAfterMs, TRACKING_CONFIG.staleAfterMs, "clients get the staleness limit");
  assert.equal(fresh?.routeMaxAgeMs, TRACKING_CONFIG.routeMaxAgeMs, "clients get the route age limit");

  /* The route row is still cached; the rider has gone quiet. */
  const stale = new Date(t0.getTime() + TRACKING_CONFIG.staleAfterMs + 1_000);
  const a = await getOrderTracking(viewer, s.orderNo, stale, { route: good, routesEnabled: true });
  assert.equal(a?.shipments[0].driver?.stale, true);
  assert.equal(a?.shipments[0].route, null, "a stale rider's cached route (and its ETA) is not served");

  /* Routing switched off: nothing refreshes the cached route, and once it is
     older than the limit it must not come back for a fresh ping either. */
  const later = new Date(t0.getTime() + TRACKING_CONFIG.routeMaxAgeMs + 5_000);
  await handleDriverLocation(req("POST", "d1", ping(later)), s.shipmentId, verify, later);
  const b = await getOrderTracking(viewer, s.orderNo, later, { route: good, routesEnabled: false });
  assert.equal(b?.shipments[0].driver?.stale, false);
  assert.equal(b?.shipments[0].route, null, "an aged-out cached route is not an ETA");
});

/* ------------------------------------------------------------------ the end of a delivery */

test("delivery by code ends tracking: no position stored, none shown, further updates refused", async () => {
  const s = await scratchOrder({ driverId: driverOne });
  await handleDriverStart(req("POST", "d1"), s.shipmentId, verify);
  const t0 = new Date();
  await handleDriverLocation(req("POST", "d1", ping(t0)), s.shipmentId, verify, t0);
  const code = (await db.shipment.findUniqueOrThrow({ where: { id: s.shipmentId }, select: { deliveryCode: true } })).deliveryCode!;

  assert.equal((await handleDriverDeliver(req("POST", "d2", { code }), s.shipmentId, verify)).status, 400, "another driver cannot deliver it");
  assert.equal((await handleDriverDeliver(req("POST", "d1", { code: "000000" === code ? "111111" : "000000" }), s.shipmentId, verify)).status, 400);
  assert.equal((await handleDriverDeliver(req("POST", "d1", { code }), s.shipmentId, verify)).status, 200);

  assert.equal(await db.shipmentLiveLocation.count({ where: { shipmentId: s.shipmentId } }), 0, "the live position is gone");
  const view = await getOrderTracking({ kind: "customer", userId: ownerId }, s.orderNo, new Date(), { routesEnabled: false });
  assert.equal(view?.shipments[0].phase, "delivered");
  assert.equal(view?.shipments[0].driver, null);

  const t1 = new Date(t0.getTime() + 10_000);
  const refused = await json(await handleDriverLocation(req("POST", "d1", ping(t1)), s.shipmentId, verify, t1));
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.metadata.reason, "NOT_TRACKABLE", "the app stops tracking on this answer");
});

test("cancelling a shipment on the road removes its live position", async () => {
  const { advanceShipment } = await import("@/lib/services/admin/shipments-write");
  const s = await scratchOrder({ driverId: driverOne });
  await handleDriverStart(req("POST", "d1"), s.shipmentId, verify);
  const t0 = new Date();
  await handleDriverLocation(req("POST", "d1", ping(t0)), s.shipmentId, verify, t0);
  const r = await advanceShipment({ shipmentId: s.shipmentId, to: "cancelled", actor: { id: ownerId, email: "zzz@demo.invalid" } });
  assert.equal(r.ok, true);
  assert.equal(await db.shipmentLiveLocation.count({ where: { shipmentId: s.shipmentId } }), 0);
});
