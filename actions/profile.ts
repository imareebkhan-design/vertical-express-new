"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth/current-user";
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
