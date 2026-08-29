"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus, BookingStatus } from "@prisma/client";
import { getAdminUser } from "@/lib/services/admin/authz";
import { advanceOrderStatus, advanceBookingStatus } from "@/lib/services/admin/manage";
import { type ActionResult, fail, succeed } from "@/lib/validators";

export async function adminAdvanceOrder(orderId: string, to: OrderStatus): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  try {
    await advanceOrderStatus(admin.id, orderId, to);
    revalidatePath("/admin/orders");
    return succeed(null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INVALID_TRANSITION") return fail("CONFLICT", "That status change isn't allowed");
    return fail("NOT_FOUND", "Order not found");
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
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INVALID_TRANSITION") return fail("CONFLICT", "That status change isn't allowed");
    return fail("NOT_FOUND", "Booking not found");
  }
}
