import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { isValidGstin, normaliseGstin } from "@/lib/gstin";

/**
 * The customer's own profile: name, what they buy as, and their business.
 *
 * One schema and one write for both transports — the native app's
 * `PATCH /api/v1/me` and the web's `updateMyProfile` action — so a GSTIN the
 * app accepts is one the web accepts, with the same message when it is not.
 * The rules are the ones `/me` already enforced; they moved here unchanged.
 *
 * The phone number and email are sign-in identity (Firebase) and are not
 * editable through this. The GSTIN is the customer's, stored on the profile;
 * no invoice carries it — there is no `Order.gstin`, and tax invoices wait on
 * the supplier's own registration.
 */

const editable = {
  fullName: z.string().trim().min(2, "Enter your name").max(80),
  buyerType: z.enum(["contractor", "homeowner", "designer"]),
  /* null clears. */
  companyName: z.string().trim().min(2, "Enter the business name").max(120).nullable(),
  gstin: z
    .string()
    .transform(normaliseGstin)
    .refine(isValidGstin, "That GSTIN doesn't look right — check the 15 characters")
    .nullable(),
};

const somethingToUpdate = [
  (v: Record<string, unknown>) => Object.values(v).some((x) => x !== undefined),
  { message: "Nothing to update" },
] as const;

/** What the web may change. */
export const webProfileSchema = z.object(editable).partial().refine(...somethingToUpdate);

/** What `/api/v1/me` may change: the same, plus closing onboarding. */
export const apiProfileSchema = z
  .object({
    ...editable,
    /* A command, not a client-supplied timestamp — a device clock can never
       write the past or the future. Set once, when the welcome step ends,
       whether the customer answered or skipped: skipping closes onboarding
       exactly as an answer does (docs/UI_PARITY_MATRIX.md, decision 14). */
    onboardedAt: z.literal("now"),
  })
  .partial()
  .refine(...somethingToUpdate);

export type ProfilePatch = z.infer<typeof apiProfileSchema>;

const fields = { fullName: true, buyerType: true, onboardedAt: true, companyName: true, gstin: true } as const;

export interface ProfileFields {
  fullName: string | null;
  buyerType: "contractor" | "homeowner" | "designer" | null;
  companyName: string | null;
  gstin: string | null;
  onboardedAt: Date | null;
}

/** The first problem, in the shape both transports report. */
export function firstProfileIssue(error: z.ZodError): { message: string; field?: string } {
  const issue = error.issues[0];
  return { message: issue?.message ?? "Invalid profile", field: issue?.path[0]?.toString() };
}

export async function getProfileFields(userId: string): Promise<ProfileFields> {
  const p = await db.profile.findUnique({ where: { userId }, select: fields });
  return {
    fullName: p?.fullName ?? null,
    buyerType: p?.buyerType ?? null,
    companyName: p?.companyName ?? null,
    gstin: p?.gstin ?? null,
    onboardedAt: p?.onboardedAt ?? null,
  };
}

/** Writes an already-validated patch to this user's profile — and only theirs:
 *  the user id comes from the verified session or token, never the request. */
export async function saveProfile(userId: string, patch: ProfilePatch): Promise<ProfileFields> {
  const { onboardedAt, ...rest } = patch;
  const data = { ...rest, ...(onboardedAt === "now" ? { onboardedAt: new Date() } : {}) };
  /* Upsert: nothing creates a Profile row at sign-up. */
  return db.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: fields });
}
