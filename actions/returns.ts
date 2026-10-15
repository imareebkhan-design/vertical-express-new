"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { createReturnRequest, moveReturnRequest } from "@/lib/services/admin/returns";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Return requests from the console. Admin only. Records and reviews — never
 * refunds, restocks or exchanges (see lib/services/admin/returns.ts).
 */
const REASONS = ["damaged_in_transit", "wrong_item", "defective", "short_quantity", "not_needed", "other"] as const;
const STATUSES = ["requested", "under_review", "inspecting", "approved", "rejected", "closed"] as const;

const intakeSchema = z.object({
  orderNo: z.string().trim().min(3).max(60),
  items: z.array(z.object({ orderItemId: z.string().uuid(), qty: z.number().int().min(0).max(100_000) })).min(1).max(100),
  reason: z.enum(REASONS),
  explanation: z.string().max(2000),
  /** datetime-local in IST, "2026-10-15T14:35". */
  requestedAtIst: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Give the date and time the customer asked"),
  channel: z.string().trim().min(2).max(60),
});

export async function adminCreateReturn(input: unknown): Promise<ActionResult<{ returnNo: string }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const p = intakeSchema.safeParse(input);
  if (!p.success) return fail("VALIDATION", p.error.issues[0]?.message ?? "Those details are not valid");
  const requestedAt = new Date(`${p.data.requestedAtIst}:00+05:30`);
  const r = await createReturnRequest({ ...p.data, requestedAt }, admin.id);
  if (!r.ok) return fail(r.reason === "not_found" ? "NOT_FOUND" : r.reason === "conflict" ? "CONFLICT" : "VALIDATION", r.message);
  revalidatePath("/admin/returns");
  revalidatePath(`/admin/orders/${p.data.orderNo}`);
  revalidatePath("/admin/orders");
  return succeed(r.value);
}

export async function adminMoveReturn(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const p = z.object({ returnNo: z.string().min(3).max(80), to: z.enum(STATUSES), note: z.string().max(1000) }).safeParse(input);
  if (!p.success) return fail("VALIDATION", "Those details are not valid");
  const r = await moveReturnRequest(p.data, admin.id);
  if (!r.ok) return fail(r.reason === "not_found" ? "NOT_FOUND" : r.reason === "conflict" ? "CONFLICT" : "VALIDATION", r.message);
  revalidatePath("/admin/returns");
  revalidatePath(`/admin/returns/${p.data.returnNo}`);
  return succeed(null);
}
