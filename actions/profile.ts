"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth/current-user";
import { firstProfileIssue, saveProfile, webProfileSchema } from "@/lib/services/profile";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * What the customer is buying as.
 *
 * This is merchandising, not permission — it decides what the home screen leads
 * with and nothing else. `Role` remains the authorization enum; a contractor and
 * a homeowner may do exactly the same things.
 *
 * The onboarding step that sets this is skippable by design, so the column is
 * nullable and every reader has to cope with null. Nobody is blocked from
 * shopping because they did not answer a question about themselves.
 */
const schema = z.object({ buyerType: z.enum(["contractor", "homeowner", "designer"]) });

export async function setBuyerType(input: unknown): Promise<ActionResult<null>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "That isn't one of the options");

  /* Upsert: a Profile row may not exist yet — nothing creates one at sign-up,
     because until now there was nothing to put in it. */
  await db.profile.upsert({
    where: { userId },
    create: { userId, buyerType: parsed.data.buyerType },
    update: { buyerType: parsed.data.buyerType },
  });

  return succeed(null);
}

/** The editable profile, as the web form shows it. */
export interface EditableProfile {
  fullName: string | null;
  buyerType: "contractor" | "homeowner" | "designer" | null;
  companyName: string | null;
  gstin: string | null;
}

/**
 * Name, buyer type and business details from `/account/profile`.
 *
 * The same rules and write as the native app's `PATCH /api/v1/me`
 * (`lib/services/profile.ts`); only the transport differs. The user is the
 * session's — the input never names whose profile it is.
 */
export async function updateMyProfile(input: unknown): Promise<ActionResult<EditableProfile>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");

  const parsed = webProfileSchema.safeParse(input);
  if (!parsed.success) {
    const { message, field } = firstProfileIssue(parsed.error);
    return fail("VALIDATION", message, field);
  }

  const saved = await saveProfile(userId, parsed.data);
  revalidatePath("/account");
  revalidatePath("/account/profile");
  return succeed({
    fullName: saved.fullName,
    buyerType: saved.buyerType,
    companyName: saved.companyName,
    gstin: saved.gstin,
  });
}
