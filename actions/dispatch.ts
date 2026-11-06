"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import {
  advanceShipment,
  assignShipment,
  confirmDelivery,
  MIN_OVERRIDE_REASON,
} from "@/lib/services/admin/shipments-write";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * The dispatch board's write path.
 *
 * `Shipment` was write-once for its whole life — created at `pending` inside
 * the checkout transaction and never advanced (ISS-009). The service that moves
 * one now exists; this is what lets a dispatcher reach it.
 *
 * Thin on purpose. Every rule about what may move where lives in
 * `lib/shipment-flow.ts` and `lib/services/admin/shipments-write.ts`, and
 * nothing here re-decides any of it — the order state machine was restated in
 * three places before it was consolidated (ISS-014), and an action file is
 * exactly where the fourth copy would have gone.
 */

const advanceSchema = z.object({
  shipmentId: z.string().uuid(),
  /* No "delivered": that happens only through the customer's code
     (adminConfirmDelivery) or the reason-required exception below. */
  to: z.enum(["packed", "out_for_delivery", "cancelled"]),
});

const overrideSchema = z.object({
  shipmentId: z.string().uuid(),
  reason: z.string().trim().min(MIN_OVERRIDE_REASON, "Write what happened (at least 10 characters) — this is recorded").max(300),
});

const assignSchema = z.object({
  shipmentId: z.string().uuid(),
  driverId: z.string().uuid("Pick a driver"),
  /* A rider on their own bike is a real case here, so a vehicle is optional. */
  vehicleId: z.union([z.string().uuid(), z.literal("")]).optional(),
});

/** Messages a dispatcher can act on, rather than a reason code. */
const ADVANCE_MESSAGE: Record<string, string> = {
  not_found: "That shipment no longer exists",
  illegal_transition: "That move is not allowed from where the shipment is now",
  raced: "Somebody else moved this shipment a moment ago — reload the board",
  no_driver: "Assign a driver before the goods leave",
  order_not_active: "This order is unpaid or cancelled — nothing in it should be moved",
  reason_required: "Write what happened before marking it delivered without a code",
};

const CONFIRM_MESSAGE: Record<string, string> = {
  /* Deliberately the same message for a wrong code, a missing shipment and one
     that is not out for delivery. Telling them apart tells an attacker which
     shipment ids are real and which are in the air. */
  rejected: "That code does not match this delivery",
  rate_limited: "Too many attempts on this delivery. Try again in a few minutes.",
};

const ASSIGN_MESSAGE: Record<string, string> = {
  not_found: "That shipment no longer exists",
  already_gone: "This shipment has already left, so its driver cannot be changed",
  driver_unavailable: "That driver is not available",
  vehicle_unavailable: "That vehicle is not available",
};

export async function adminAdvanceShipment(
  input: unknown
): Promise<ActionResult<{ deliveryCode: string | null }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That is not a valid move");
  }

  const res = await advanceShipment({ ...parsed.data, actor: admin });
  if (!res.ok) {
    return fail("CONFLICT", ADVANCE_MESSAGE[res.reason] ?? "That move could not be made");
  }

  revalidatePath("/admin/dispatch");
  revalidatePath("/admin");
  /* The code is returned so the dispatcher can read it to the driver once. It
     is not persisted anywhere else and never reaches the audit trail. */
  return succeed({ deliveryCode: res.deliveryCode });
}

export async function adminAssignShipment(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That assignment is not valid");
  }

  const res = await assignShipment({
    shipmentId: parsed.data.shipmentId,
    driverId: parsed.data.driverId,
    vehicleId: parsed.data.vehicleId || null,
    actor: admin,
  });
  if (!res.ok) {
    return fail("CONFLICT", ASSIGN_MESSAGE[res.reason] ?? "That assignment could not be made");
  }

  revalidatePath("/admin/dispatch");
  return succeed(null);
}

const confirmSchema = z.object({
  shipmentId: z.string().uuid(),
  /* Six digits, checked here so an obviously malformed entry never reaches the
     limiter and burns one of the customer's five attempts. */
  code: z.string().trim().regex(/^\d{6}$/, "A delivery code is six digits"),
});

/**
 * The customer reads the code at the gate.
 *
 * The code is not logged, not echoed back and not put in the audit trail — the
 * trail records that a matching code was presented. A failure says the same
 * thing whatever went wrong.
 */
export async function adminConfirmDelivery(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That is not a delivery code");
  }

  const res = await confirmDelivery({ ...parsed.data, actor: admin });
  if (!res.ok) {
    return fail("CONFLICT", CONFIRM_MESSAGE[res.reason] ?? "That delivery could not be confirmed");
  }

  revalidatePath("/admin/dispatch");
  revalidatePath("/admin");
  return succeed(null);
}

/**
 * Exception: mark a shipment delivered without the customer's code (they could
 * not read it out). Requires a written reason, recorded in the audit trail as
 * `proof: "override"` — distinguishable from a code-confirmed delivery.
 */
export async function adminDeliverWithoutCode(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Write what happened");
  const res = await advanceShipment({ shipmentId: parsed.data.shipmentId, to: "delivered", actor: admin, overrideReason: parsed.data.reason });
  if (!res.ok) return fail("CONFLICT", ADVANCE_MESSAGE[res.reason] ?? "That delivery could not be recorded");
  revalidatePath("/admin/dispatch");
  revalidatePath("/admin/orders");
  return succeed(null);
}
