"use server";

import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { createBooking } from "@/lib/services/bookings";
import { rateLimit } from "@/lib/services/rate-limit";
import { phoneSchema, type ActionResult, fail, succeed } from "@/lib/validators";

const bookingSchema = z.object({
  serviceSlug: z.string().min(1),
  name: z.string().min(2, "Name is required").max(80),
  phone: phoneSchema,
  propertyType: z.enum(["apartment", "house", "plot", "commercial"]),
  scope: z.string().min(5, "Tell us a bit about the work").max(1000),
  preferredDate: z.string().optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  pincode: z.string().max(6).optional().or(z.literal("")),
});

/** Submit a service booking. Auth optional — captured by phone, linked if logged in. */
export async function submitBooking(input: unknown): Promise<ActionResult<{ bookingNo: string }>> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail("VALIDATION", issue?.message ?? "Invalid details", issue?.path[0]?.toString());
  }

  // P1-4: throttle public booking submissions per phone (spam protection).
  const limit = await rateLimit(`booking:${parsed.data.phone}`, 5, 60 * 60 * 1000); // 5 per hour
  if (!limit.allowed) {
    return fail("RATE_LIMITED", "Too many requests. Please try again later.");
  }

  const userId = await getAuthUserId();
  try {
    const booking = await createBooking({
      ...parsed.data,
      preferredDate: parsed.data.preferredDate || null,
      userId,
    });
    return succeed({ bookingNo: booking.bookingNo });
  } catch {
    return fail("NOT_FOUND", "That service isn't available right now");
  }
}
