"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { SETTING_KEYS, writeSetting } from "@/lib/services/settings";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Editing the settings that decide what the business promises.
 *
 * Each field is validated to the thing it actually is, not to "a string". These
 * are the values that pay money out, appear on a tax document, and tell a
 * customer when their cement arrives — a percentage that accepts "banana", or a
 * GSTIN that accepts anything, is how the wrong number reaches production
 * without anybody typing it deliberately.
 *
 * Blank clears a setting rather than storing an empty string, because "not set"
 * has to stay distinguishable from "set to nothing". The read path treats a
 * missing value as the safe default; an empty string would parse as a value.
 */
const schema = z.object({
  /* 0 is meaningful and different from unset: it means "we run a cashback
     programme and it currently pays nothing", which somebody might want. */
  cashbackPercent: z
    .string()
    .trim()
    .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100), {
      message: "Cashback must be a percentage between 0 and 100",
    }),

  /* The real GSTIN format. Two fabricated ones shipped before (ISS-056) and a
     wrong number on an invoice fails in the customer's accounting, weeks later,
     against a document they filed. */
  gstin: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/.test(v), {
      message: "That is not a valid GSTIN",
    }),

  expressMinutes: z
    .string()
    .trim()
    .refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 1440), {
      message: "Express delivery must be a whole number of minutes",
    }),

  codEnabled: z.enum(["true", "false"]),

  defaultSort: z.enum(["newest", "most_ordered"]),
});

export async function adminSaveSettings(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those values are not valid");
  }

  const d = parsed.data;
  await Promise.all([
    writeSetting(SETTING_KEYS.cashbackPercent, d.cashbackPercent, admin.email),
    writeSetting(SETTING_KEYS.gstin, d.gstin, admin.email),
    writeSetting(SETTING_KEYS.expressMinutes, d.expressMinutes, admin.email),
    writeSetting(SETTING_KEYS.codEnabled, d.codEnabled, admin.email),
    writeSetting(SETTING_KEYS.defaultSort, d.defaultSort, admin.email),
  ]);

  /* Settings reach the storefront, not just the console. */
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return succeed(null);
}
