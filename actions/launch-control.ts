"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { applyLaunchChange, planLaunchChange, planLaunchUndo } from "@/lib/services/admin/launch-control";
import { launchChangeSetSchema, type LaunchPlan } from "@/lib/launch-control";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Launch Control switches (PR-4): category and brand visibility.
 *
 * Every action is admin-only and checks the operator itself (a server action
 * is reachable by POST without the page). Planning writes nothing. Applying is
 * one audited batch, refused if anything changed since the plan or if a
 * multi-switch batch is not typed. Visibility only: product status, stock,
 * prices and checkout rules are not touched here.
 */

const batchId = z.string().uuid();

export async function adminPlanLaunchChange(input: unknown): Promise<ActionResult<LaunchPlan>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = launchChangeSetSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those changes are not valid");
  return succeed(await planLaunchChange(parsed.data));
}

export async function adminPlanLaunchUndo(id: unknown): Promise<ActionResult<{ plan: LaunchPlan | null; conflicts: { kind: "category" | "brand"; slug: string }[] }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = batchId.safeParse(id);
  if (!parsed.success) return fail("VALIDATION", "That is not a batch");
  const undo = await planLaunchUndo(parsed.data);
  if (!undo) return fail("NOT_FOUND", "That batch no longer exists");
  return succeed(undo);
}

const applySchema = z.object({
  changeSet: launchChangeSetSchema,
  confirmText: z.string().trim().max(40).nullable().default(null),
  undoOf: batchId.optional(),
});

export async function adminApplyLaunchChange(input: unknown): Promise<ActionResult<{ batchId: string | null; changed: number }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those changes are not valid");

  const r = await applyLaunchChange(parsed.data.changeSet, parsed.data.confirmText, { id: admin.id, email: admin.email }, parsed.data.undoOf);
  if (!r.ok) {
    if (r.code === "STALE_PLAN") {
      return fail("CONFLICT", "Something changed since you reviewed this. Review the changes again.", undefined, { stale: r.stale });
    }
    if (r.code === "MISSING") return fail("NOT_FOUND", "A category or brand in this change no longer exists", undefined, { missing: r.missing });
    if (r.code === "CONFIRMATION_REQUIRED") return fail("VALIDATION", `Type ${r.expected} to apply`, "confirm", { expected: r.expected });
    return fail("VALIDATION", r.message);
  }

  revalidatePath("/admin/launch-control");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/brands");
  revalidatePath("/categories");
  revalidatePath("/", "layout");
  return succeed({ batchId: r.batchId, changed: r.changed });
}
