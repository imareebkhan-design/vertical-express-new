"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus, BookingStatus } from "@/prisma/generated/client/client";
import { getAdminUser } from "@/lib/services/admin/authz";
import { advanceOrderStatus, advanceBookingStatus } from "@/lib/services/admin/manage";
import { type ActionResult, fail, succeed } from "@/lib/validators";
import { captureException } from "@/lib/observability";
import { STATUS_FAULT, bookingStatusRefusal, orderStatusRefusal } from "@/lib/admin-status-errors";
import { adminCheckPayment as checkPaymentWithGateway } from "@/lib/services/admin/check-payment";
import { adminPaymentCheckMessage, type AdminPaymentCheckMessage, type AdminPaymentCheckResult } from "@/lib/admin-payment-check";
import { z } from "zod";

export async function adminAdvanceOrder(orderId: string, to: OrderStatus): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  try {
    await advanceOrderStatus(admin.id, orderId, to);
    revalidatePath("/admin/orders");
    return succeed(null);
  } catch (e) {
    const refusal = orderStatusRefusal(e);
    if (!refusal) captureException(e, { action: "adminAdvanceOrder", orderId, to });
    const told = refusal ?? STATUS_FAULT;
    if (told.changedSomething) revalidatePath("/admin/orders");
    return fail(told.code, told.message);
  }
}

export async function adminAdvanceBooking(bookingId: string, to: BookingStatus): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  try {
    await advanceBookingStatus(admin.id, bookingId, to);
    revalidatePath("/admin/bookings");
    return succeed(null);
  } catch (e) {
    const refusal = bookingStatusRefusal(e);
    if (!refusal) captureException(e, { action: "adminAdvanceBooking", bookingId, to });
    const told = refusal ?? STATUS_FAULT;
    return fail(told.code, told.message);
  }
}

const checkPaymentSchema = z.object({ orderId: z.uuid() });

/**
 * "Check payment" on an order awaiting payment (roadmap B-4): ask Razorpay, and
 * confirm the order only if Razorpay has captured the money. Returns the
 * sentence the operator is shown; it says whether anything changed.
 */
export async function adminCheckOrderPayment(
  input: unknown
): Promise<ActionResult<AdminPaymentCheckMessage & { result: AdminPaymentCheckResult }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = checkPaymentSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "That order reference is not valid");
  try {
    const { result, orderNo } = await checkPaymentWithGateway(admin.id, parsed.data.orderId);
    const told = adminPaymentCheckMessage(result);
    if (told.changed) {
      revalidatePath("/admin/orders");
      revalidatePath(`/admin/orders/${orderNo}`);
      revalidatePath("/admin/payments");
      revalidatePath("/admin");
    }
    return succeed({ ...told, result });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return fail("NOT_FOUND", "That order no longer exists");
    captureException(e, { action: "adminCheckOrderPayment", orderId: parsed.data.orderId });
    /* Not "nothing changed": the failure may have come after Razorpay's answer
       was recorded. Re-read the screens and say only what is known. */
    revalidatePath("/admin/orders");
    revalidatePath("/admin/payments");
    return fail("UNAVAILABLE", "The check could not be completed. Reload the order to see its current state before trying again.");
  }
}
