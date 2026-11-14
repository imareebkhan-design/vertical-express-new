"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus, BookingStatus } from "@/prisma/generated/client/client";
import { getAdminUser } from "@/lib/services/admin/authz";
import { advanceOrderStatus, advanceBookingStatus } from "@/lib/services/admin/manage";
import { type ActionResult, fail, succeed } from "@/lib/validators";
import { captureException } from "@/lib/observability";
import { STATUS_FAULT, bookingStatusRefusal, orderStatusRefusal } from "@/lib/admin-status-errors";

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
