"use server";

import { headers } from "next/headers";
import { getAuthUser } from "@/lib/auth/current-user";
import { getAdminUser } from "@/lib/services/admin/authz";
import { getClientIp } from "@/lib/services/rate-limit";
import { submitProductEnquiry } from "@/lib/services/product-enquiry-submit";
import { ENQUIRY_STATUSES, setProductEnquiryStatus } from "@/lib/services/product-enquiries";
import { type ActionResult, fail, succeed } from "@/lib/validators";
import { revalidatePath } from "next/cache";

/** "Enquire about this product". Sign-in optional; linked when signed in. */
export async function submitProductEnquiryAction(input: unknown): Promise<ActionResult<{ enquiryNo: string }>> {
  const ip = getClientIp(new Request("http://local", { headers: await headers() }));
  const user = await getAuthUser();
  const r = await submitProductEnquiry(input, { ip, userId: user?.id ?? null });
  if (!r.ok) return fail(r.code, r.message, r.field);
  return succeed({ enquiryNo: r.enquiryNo });
}

/** Admin: move an enquiry through the queue. */
export async function adminSetProductEnquiryStatus(input: {
  enquiryId: string;
  status: string;
  adminNotes?: string | null;
}): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admins only");
  if (!(ENQUIRY_STATUSES as readonly string[]).includes(input.status)) return fail("VALIDATION", "Unknown status");
  if (typeof input.enquiryId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.enquiryId)) return fail("VALIDATION", "Unknown enquiry");
  const notes = input.adminNotes == null ? input.adminNotes : String(input.adminNotes).slice(0, 1000);
  const r = await setProductEnquiryStatus(admin.id, input.enquiryId, input.status as (typeof ENQUIRY_STATUSES)[number], notes);
  if (!r.ok) return r.reason === "NOT_FOUND" ? fail("NOT_FOUND", "Enquiry not found") : succeed(null);
  revalidatePath("/admin/enquiries");
  return succeed(null);
}
