"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus, BookingStatus } from "@/prisma/generated/client/client";
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
    if (msg === "STATUS_CHANGED") return fail("CONFLICT", "This order changed while you were looking at it. Reload and try again.");
    if (msg === "SHIPMENT_DISPATCHED") return fail("CONFLICT", "Part of this order has already left the warehouse. Handle the shipment on the dispatch board instead.");
    if (msg === "USE_DISPATCH") return fail("CONFLICT", "Packing, dispatch and delivery are done on the dispatch board for this order — delivery needs the customer's code.");
    if (msg === "PAYMENT_REQUIRED") return fail("CONFLICT", "An online order is confirmed by its payment, not by hand.");
    if (msg === "PAYMENT_FOUND") {
      revalidatePath("/admin/orders");
      return fail("CONFLICT", "Razorpay shows this order was paid, so it was not cancelled. Reload to see it. To cancel a paid order, cancel it again and refund it from Payments.");
    }
    if (msg === "PAYMENT_IN_PROGRESS") return fail("CONFLICT", "A payment for this order is in progress at Razorpay. Wait a few minutes and try again.");
    if (msg === "PAYMENT_STATUS_UNKNOWN") return fail("CONFLICT", "Razorpay could not be asked whether this order was paid, so it was not cancelled. Try again in a few minutes.");
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
