import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { advanceShipment, confirmDelivery } from "@/lib/services/admin/shipments-write";
import { computeDrivingRoute, routesConfigured } from "@/lib/services/routes";
import { validLatLng, type LatLng } from "@/lib/tracking/geo";
import {
  TRACKING_CONFIG,
  checkPing,
  etaMinutes,
  isStale,
  phaseFor,
  pingAllowed,
  routeDecision,
  shouldSample,
  type RouteResult,
  type ShipmentPhase,
} from "@/lib/tracking/policy";

/**
 * Live delivery tracking: who may send a position, where it goes, and what a
 * customer may read back. The rules are pure (lib/tracking/policy.ts); this is
 * the database and authorisation around them.
 *
 * Positions come only from the assigned driver's device. Nothing here invents,
 * interpolates or extrapolates one, and nothing is returned for a shipment that
 * is not on the road.
 */

/* =================================================================== drivers */

export interface DriverIdentity {
  driverId: string;
  name: string;
}

/** `+919876543210` or null — the same rule sign-in and the roster use. */
function e164(value: unknown): string | null {
  return typeof value === "string" && /^\+[1-9]\d{6,14}$/.test(value.trim()) ? value.trim() : null;
}

/**
 * The active driver this verified token belongs to, or null.
 *
 * Matched on the `phone_number` claim — a number Firebase itself verified by
 * OTP — against `Driver.phone`, which ops entered on the roster. Never on a
 * client-supplied id and never on `User.phone`. The first account to match is
 * pinned to the driver row; any other account presenting the same number later
 * (a recycled SIM, a re-registered phone) is refused until ops clears the pin.
 */
export async function resolveDriver(token: DecodedIdToken): Promise<DriverIdentity | null> {
  const phone = e164(token.phone_number);
  if (!phone) return null;
  const driver = await db.driver.findUnique({
    where: { phone },
    select: { id: true, name: true, isActive: true, firebaseUid: true },
  });
  if (!driver || !driver.isActive) return null;
  if (driver.firebaseUid === token.uid) return { driverId: driver.id, name: driver.name };
  if (driver.firebaseUid !== null) return null;

  /* Pin on first use, guarded so two first sign-ins cannot both win. */
  const pinned = await db.driver.updateMany({ where: { id: driver.id, firebaseUid: null }, data: { firebaseUid: token.uid } });
  if (pinned.count === 1) return { driverId: driver.id, name: driver.name };
  const again = await db.driver.findUnique({ where: { id: driver.id }, select: { firebaseUid: true } });
  return again?.firebaseUid === token.uid ? { driverId: driver.id, name: driver.name } : null;
}

interface AddressSnapshot {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  landmark?: string | null;
  accessNote?: string | null;
  city?: string;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
}

function destinationOf(address: unknown): LatLng | null {
  const a = (address ?? {}) as AddressSnapshot;
  return validLatLng(a.latitude, a.longitude) ? { lat: a.latitude as number, lng: a.longitude as number } : null;
}

/**
 * The driver's work: shipments assigned to them that are ready to go or on the
 * road. Carries what a driver needs at the gate — who, where, how to reach them
 * — and nothing about other customers, prices or the delivery code (which is
 * the customer's proof, read out to the driver, never shown to them).
 */
export async function listDriverShipments(driverId: string) {
  const rows = await db.shipment.findMany({
    where: { driverId, status: { in: ["packed", "out_for_delivery"] } },
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      sequence: true,
      status: true,
      speedClass: true,
      order: { select: { orderNo: true, address: true, _count: { select: { shipments: true } } } },
      _count: { select: { items: true } },
    },
  });
  return rows.map((s) => {
    const a = (s.order.address ?? {}) as AddressSnapshot;
    return {
      id: s.id,
      orderNo: s.order.orderNo,
      sequence: s.sequence,
      shipmentCount: s.order._count.shipments,
      status: s.status,
      speedClass: s.speedClass,
      itemCount: s._count.items,
      destination: destinationOf(s.order.address),
      contact: { name: a.name ?? null, phone: a.phone ?? null },
      address: {
        line1: a.line1 ?? null,
        line2: a.line2 ?? null,
        landmark: a.landmark ?? null,
        accessNote: a.accessNote ?? null,
        city: a.city ?? null,
        pincode: a.pincode ?? null,
      },
    };
  });
}

/** "Start delivery": the driver takes their own packed shipment onto the road. */
export async function startDelivery(driver: DriverIdentity, shipmentId: string) {
  const result = await advanceShipment({
    shipmentId,
    to: "out_for_delivery",
    actor: { id: driver.driverId, email: `driver:${driver.driverId}` },
    actorType: "driver",
    requireDriverId: driver.driverId,
  });
  /* The delivery code is never returned to the driver: it is what the customer
     reads out to prove the handover. */
  return result.ok ? ({ ok: true, status: result.status } as const) : result;
}

/** "Delivered": proven by the code the customer reads out. Ends tracking. */
export function finishDelivery(driver: DriverIdentity, shipmentId: string, code: string) {
  return confirmDelivery({
    shipmentId,
    code,
    actor: { id: driver.driverId, email: `driver:${driver.driverId}` },
    actorType: "driver",
    requireDriverId: driver.driverId,
  });
}

export type LocationWrite =
  | { ok: true; sampled: boolean }
  | { ok: false; reason: "invalid" | "stale" | "future" | "imprecise" | "not_found" | "not_trackable" | "rate_limited" };

/**
 * Accepts one position from the driver's device.
 *
 * Refused unless the caller is the shipment's assigned driver and the shipment
 * is out for delivery — "not found" for a shipment that is not theirs, so the
 * answer does not confirm that it exists. The status check is repeated under a
 * row lock inside the write, so a position cannot land after the delivery
 * transaction has removed the last one.
 */
export async function recordDriverLocation(
  driver: DriverIdentity,
  shipmentId: string,
  body: unknown,
  now = new Date()
): Promise<LocationWrite> {
  const verdict = checkPing(body, now);
  if (!verdict.ok) return verdict;
  const { ping } = verdict;

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { driverId: true, status: true, liveLocation: { select: { receivedAt: true, lastSampledAt: true } } },
  });
  if (!shipment || shipment.driverId !== driver.driverId) return { ok: false, reason: "not_found" };
  if (shipment.status !== "out_for_delivery") return { ok: false, reason: "not_trackable" };
  if (!pingAllowed(shipment.liveLocation?.receivedAt ?? null, now)) return { ok: false, reason: "rate_limited" };
  const sample = shouldSample(shipment.liveLocation?.lastSampledAt ?? null, now);

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM shipments
      WHERE id = ${shipmentId}::uuid AND status = 'out_for_delivery' AND driver_id = ${driver.driverId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) return { ok: false, reason: "not_trackable" } as const;

    const position = {
      driverId: driver.driverId,
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracyM: ping.accuracy,
      headingDeg: ping.heading,
      speedMps: ping.speed,
      recordedAt: ping.timestamp,
      receivedAt: now,
      ...(sample ? { lastSampledAt: now } : {}),
    };
    await tx.shipmentLiveLocation.upsert({
      where: { shipmentId },
      create: { shipmentId, ...position },
      update: position,
    });
    if (sample) {
      await tx.shipmentLocationSample.create({
        data: { shipmentId, latitude: ping.latitude, longitude: ping.longitude, recordedAt: ping.timestamp },
      });
    }
    return { ok: true, sampled: sample } as const;
  });
}

/* =================================================================== customers */

export interface ShipmentTracking {
  id: string;
  sequence: number;
  phase: ShipmentPhase;
  driverName: string | null;
  /** Only while out for delivery and a real position exists. */
  driver: { lat: number; lng: number; heading: number | null; recordedAt: string; stale: boolean } | null;
  /** Only once the Routes API has answered for the driver's current leg. */
  route: { distanceM: number; durationS: number; etaMinutes: number; polyline: string; computedAt: string } | null;
}

export interface OrderTracking {
  orderNo: string;
  destination: LatLng | null;
  pollMs: number;
  /** Clients re-check freshness on their own clock with these (see `liveTrackingView`). */
  staleAfterMs: number;
  routeMaxAgeMs: number;
  shipments: ShipmentTracking[];
}

export type TrackingViewer = { kind: "customer"; userId: string } | { kind: "admin" };

export interface TrackingDeps {
  route?: (origin: LatLng, destination: LatLng) => Promise<RouteResult | null>;
  routesEnabled?: boolean;
}

/**
 * What the customer's tracking screen may show for one order.
 *
 * Ownership is in the query: someone else's order and a missing one are the
 * same null. Driver position is returned only for shipments out for delivery —
 * delivered and cancelled ones have none (and none is stored). The route is
 * refreshed here, on read, so Google is paid only while somebody is actually
 * watching, and only when `routeDecision` says the cached one will not do.
 */
export async function getOrderTracking(
  viewer: TrackingViewer,
  orderNo: string,
  now = new Date(),
  deps: TrackingDeps = {}
): Promise<OrderTracking | null> {
  const order = await db.order.findFirst({
    where: { orderNo, ...(viewer.kind === "customer" ? { userId: viewer.userId } : {}) },
    select: {
      orderNo: true,
      address: true,
      shipments: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          status: true,
          driver: { select: { name: true } },
          liveLocation: true,
        },
      },
    },
  });
  if (!order) return null;

  const destination = destinationOf(order.address);
  const route = deps.route ?? computeDrivingRoute;
  const routesEnabled = deps.routesEnabled ?? routesConfigured();

  const shipments: ShipmentTracking[] = [];
  for (const s of order.shipments) {
    const phase = phaseFor(s.status);
    const live = phase === "live" ? s.liveLocation : null;
    let driver: ShipmentTracking["driver"] = null;
    let routeView: ShipmentTracking["route"] = null;

    if (live) {
      const stale = isStale(live.recordedAt, now);
      driver = {
        lat: live.latitude,
        lng: live.longitude,
        heading: live.headingDeg,
        recordedAt: live.recordedAt.toISOString(),
        stale,
      };

      let cached =
        live.routeComputedAt && live.routePolyline && live.routeDistanceM !== null && live.routeDurationS !== null
          ? { computedAt: live.routeComputedAt, polyline: live.routePolyline, distanceM: live.routeDistanceM, durationS: live.routeDurationS }
          : null;

      /* A stale position is not routed from: the route would describe where the
         driver was. */
      if (destination && !stale && routesEnabled) {
        const position = { lat: live.latitude, lng: live.longitude };
        const decision = routeDecision(position, live.routeComputedAt ? { computedAt: live.routeComputedAt, polyline: live.routePolyline } : null, now);
        if (decision.refresh) {
          cached = await refreshRoute(s.id, live.routeComputedAt, position, destination, now, route, cached);
        }
      }
      /* A route is shown only from a fresh position and only while young
         enough to describe the current leg. A cached route can be older — the
         refresh may belong to another viewer, routing may be switched off — and
         an old route's ETA is a wrong ETA. No minutes are ever defaulted. */
      const minutes = cached ? etaMinutes(cached.durationS) : null;
      const routeYoung = cached !== null && now.getTime() - cached.computedAt.getTime() <= TRACKING_CONFIG.routeMaxAgeMs;
      if (cached && !stale && routeYoung && minutes !== null) {
        routeView = {
          distanceM: cached.distanceM,
          durationS: cached.durationS,
          etaMinutes: minutes,
          polyline: cached.polyline,
          computedAt: cached.computedAt.toISOString(),
        };
      }
    }

    shipments.push({
      id: s.id,
      sequence: s.sequence,
      phase,
      driverName: phase === "ready" || phase === "live" ? (s.driver?.name ?? null) : null,
      driver,
      route: routeView,
    });
  }

  return {
    orderNo: order.orderNo,
    destination,
    pollMs: TRACKING_CONFIG.customerPollMs,
    staleAfterMs: TRACKING_CONFIG.staleAfterMs,
    routeMaxAgeMs: TRACKING_CONFIG.routeMaxAgeMs,
    shipments,
  };
}

type Cached = { computedAt: Date; polyline: string; distanceM: number; durationS: number };

/**
 * Claims the refresh (so concurrent viewers make one Google request, not one
 * each), asks for the route, stores it. On failure the cached route is cleared
 * rather than kept: an ETA from an expired or abandoned route is a wrong ETA,
 * and "no ETA" is the honest fallback.
 */
async function refreshRoute(
  shipmentId: string,
  previousComputedAt: Date | null,
  origin: LatLng,
  destination: LatLng,
  now: Date,
  route: NonNullable<TrackingDeps["route"]>,
  cached: Cached | null
): Promise<Cached | null> {
  const claim = await db.shipmentLiveLocation.updateMany({
    where: { shipmentId, routeComputedAt: previousComputedAt },
    data: { routeComputedAt: now, routeCalls: { increment: 1 } },
  });
  if (claim.count === 0) {
    /* Another viewer is refreshing right now; show what is cached. */
    return cached;
  }
  const result = await route(origin, destination);
  if (!result) {
    await db.shipmentLiveLocation.updateMany({
      where: { shipmentId },
      data: { routePolyline: null, routeDistanceM: null, routeDurationS: null, routeOriginLat: null, routeOriginLng: null },
    });
    return null;
  }
  await db.shipmentLiveLocation.updateMany({
    where: { shipmentId },
    data: {
      routePolyline: result.polyline,
      routeDistanceM: result.distanceM,
      routeDurationS: result.durationS,
      routeOriginLat: origin.lat,
      routeOriginLng: origin.lng,
    },
  });
  return { computedAt: now, polyline: result.polyline, distanceM: result.distanceM, durationS: result.durationS };
}
