import "server-only";
import type { NextResponse } from "next/server";
import { bearerToken, type TokenVerifier } from "@/lib/auth/api-identity";
import { verifyIdToken } from "@/lib/auth/firebase-admin";
import { readJson, withApiUser, type ApiDeps } from "@/lib/api/authed";
import { apiFail, apiOk } from "@/lib/api/response";
import { getClientIp, rateLimit } from "@/lib/services/rate-limit";
import { runWithContext } from "@/lib/observability";
import {
  finishDelivery,
  getOrderTracking,
  listDriverShipments,
  recordDriverLocation,
  resolveDriver,
  startDelivery,
  type DriverIdentity,
  type TrackingDeps,
} from "@/lib/services/tracking";

/**
 * HTTP for live tracking: the customer's read, and the driver app's four calls.
 * Bearer tokens only, like the rest of `/api/v1` (see lib/auth/api-identity.ts
 * for why no cookie fallback).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ customer */

/** GET /api/v1/orders/:orderNo/tracking — the order's owner only. */
export function handleOrderTracking(
  request: Request,
  orderNo: string,
  deps: ApiDeps & { tracking?: TrackingDeps; now?: Date } = {}
): Promise<NextResponse> {
  return withApiUser(request, "trk-get", deps, async ({ userId }) => {
    const tracking = await getOrderTracking({ kind: "customer", userId }, orderNo, deps.now, deps.tracking);
    if (!tracking) return apiFail("NOT_FOUND", "Order not found");
    return apiOk(tracking, 200);
  });
}

/* ------------------------------------------------------------------ driver */

const LIMIT = { hits: 120, windowMs: 60 * 1000 };

/**
 * Like `withApiUser`, for the driver app: rate-limit, verify the token, then
 * resolve it to an active `Driver` by its verified phone (see `resolveDriver`).
 * A signed-in customer who is not on the roster gets 403, the same as anyone
 * else who is not a driver.
 */
export async function withApiDriver(
  request: Request,
  bucket: string,
  verify: TokenVerifier = verifyIdToken,
  run: (driver: DriverIdentity) => Promise<NextResponse>
): Promise<NextResponse> {
  const limit = await rateLimit(`api-drv-${bucket}:${getClientIp(request)}`, LIMIT.hits, LIMIT.windowMs);
  if (!limit.allowed) return apiFail("RATE_LIMITED", "Too many requests. Try again shortly.");

  const token = bearerToken(request);
  if (!token) return apiFail("UNAUTHENTICATED", "Sign in to continue");
  const decoded = await verify(token);
  if (!decoded) return apiFail("UNAUTHENTICATED", "Sign in to continue");
  const driver = await resolveDriver(decoded);
  if (!driver) return apiFail("FORBIDDEN", "This account is not a delivery partner");

  const requestId = request.headers.get("x-request-id") || `api-${crypto.randomUUID()}`;
  return runWithContext({ requestId, userId: `driver:${driver.driverId}` }, () => run(driver));
}

/** GET /api/v1/driver/shipments */
export function handleDriverShipments(request: Request, verify?: TokenVerifier) {
  return withApiDriver(request, "list", verify, async (driver) =>
    apiOk({ driver: { name: driver.name }, shipments: await listDriverShipments(driver.driverId) })
  );
}

/** POST /api/v1/driver/shipments/:id/start */
export function handleDriverStart(request: Request, shipmentId: string, verify?: TokenVerifier) {
  return withApiDriver(request, "start", verify, async (driver) => {
    if (!UUID.test(shipmentId)) return apiFail("NOT_FOUND", "Delivery not found");
    const result = await startDelivery(driver, shipmentId);
    if (result.ok) return apiOk({ status: result.status });
    if (result.reason === "not_found" || result.reason === "raced") {
      return apiFail("NOT_FOUND", "This delivery is not assigned to you, or has already started");
    }
    return apiFail("CONFLICT", "This delivery cannot be started now");
  });
}

/** POST /api/v1/driver/shipments/:id/location */
export function handleDriverLocation(request: Request, shipmentId: string, verify?: TokenVerifier, now?: Date) {
  return withApiDriver(request, "loc", verify, async (driver) => {
    if (!UUID.test(shipmentId)) return apiFail("NOT_FOUND", "Delivery not found");
    const result = await recordDriverLocation(driver, shipmentId, await readJson(request), now);
    if (result.ok) return apiOk({ accepted: true, sampled: result.sampled });
    switch (result.reason) {
      case "invalid":
      case "imprecise":
        return apiFail("VALIDATION", "Invalid location", { metadata: { reason: result.reason } });
      case "stale":
      case "future":
        return apiFail("VALIDATION", "Location timestamp out of range", { metadata: { reason: result.reason } });
      case "rate_limited":
        return apiFail("RATE_LIMITED", "Location updates are too frequent");
      case "not_trackable":
        /* The app stops tracking on this answer: delivered, cancelled or reassigned. */
        return apiFail("CONFLICT", "This delivery is not on the road", { metadata: { reason: "NOT_TRACKABLE" } });
      case "not_found":
        return apiFail("NOT_FOUND", "Delivery not found");
    }
  });
}

/** POST /api/v1/driver/shipments/:id/deliver  { code } */
export function handleDriverDeliver(request: Request, shipmentId: string, verify?: TokenVerifier) {
  return withApiDriver(request, "deliver", verify, async (driver) => {
    if (!UUID.test(shipmentId)) return apiFail("NOT_FOUND", "Delivery not found");
    const body = (await readJson(request)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4,8}$/.test(code)) return apiFail("VALIDATION", "Enter the code the customer reads out", { field: "code" });
    const result = await finishDelivery(driver, shipmentId, code);
    if (result.ok) return apiOk({ status: "delivered" });
    if (result.reason === "rate_limited") return apiFail("RATE_LIMITED", "Too many attempts. Wait a few minutes.");
    return apiFail("VALIDATION", "That code does not match this delivery", { field: "code" });
  });
}
