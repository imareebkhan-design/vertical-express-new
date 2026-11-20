"use server";

import { getAuthUserId } from "@/lib/auth/current-user";
import { getAdminUser } from "@/lib/services/admin/authz";
import { getOrderTracking, type OrderTracking } from "@/lib/services/tracking";
import { rateLimit } from "@/lib/services/rate-limit";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * The web tracking screen's poll — `/api/v1/orders/:orderNo/tracking` for the
 * session cookie. The order's owner reads their own order; an operator may read
 * any (dispatch needs to see what the customer sees). Everyone else gets the
 * same "not found" a missing order gets.
 */
export async function getOrderTrackingAction(orderNo: unknown): Promise<ActionResult<OrderTracking>> {
  if (typeof orderNo !== "string" || orderNo.length > 64) return fail("VALIDATION", "Invalid order");
  const userId = await getAuthUserId();
  const admin = userId ? null : await getAdminUser();
  if (!userId && !admin) return fail("UNAUTHENTICATED", "Sign in to track this order");

  /* The screen polls every few seconds; this is several times that. */
  const limit = await rateLimit(`trk-web:${userId ?? admin?.id}`, 40, 60_000);
  if (!limit.allowed) return fail("RATE_LIMITED", "Too many refreshes. Try again shortly.");

  let tracking = userId ? await getOrderTracking({ kind: "customer", userId }, orderNo) : null;
  if (!tracking && (admin ?? (await getAdminUser()))) tracking = await getOrderTracking({ kind: "admin" }, orderNo);
  return tracking ? succeed(tracking) : fail("NOT_FOUND", "Order not found");
}
