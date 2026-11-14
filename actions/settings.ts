"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { parseRupeeInput } from "@/lib/money";
import { SETTING_KEYS, writeSetting, readSettings, type SettingKey } from "@/lib/services/settings";
import { recordAudit } from "@/lib/services/audit";
import { db } from "@/lib/db";
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
/** A blank-or-whole-minutes field, capped at a day. */
function minutesField(message: string) {
  return z
    .string()
    .trim()
    .refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 1440), {
      message,
    });
}

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

  /* Rupees as typed. Stored as paise, so the boundary parses rather than
     trusts — parseRupeeInput assembles from matched digits with no float
     multiply, which is how every other money field here is read. Blank means
     express is not offered at all, which is why there is no default. */
  expressFeeRupees: z
    .string()
    .trim()
    .refine((v) => v === "" || (parseRupeeInput(v) !== null && parseRupeeInput(v)! > 0), {
      message: "The express charge must be a rupee amount above zero",
    }),

  /* Both are targets to measure against, not promises to a customer, so they
     are looser than the express window — but still whole minutes, and still
     blank-means-unset. Blank is what stops the console reporting compliance
     against a number nobody chose (ISS-064). */
  packSlaMinutes: minutesField("The packing target must be a whole number of minutes"),
  deliverySlaMinutes: minutesField("The delivery target must be a whole number of minutes"),

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

  /* These are the numbers that decide what a customer is charged and what the
     business pays out: the cashback rate, the express fee, the COD switch, the
     GSTIN printed on a document. Two things were wrong with saving them.

     They were eight independent upserts under Promise.all, so a failure part
     way through left some changed and some not, with nothing to say which —
     cashback on and its fee unset is a worse state than either.

     And the only record of the change was a stdout log line. `Setting.updatedBy`
     holds the last actor and nothing else: change the cashback rate three times
     and the two earlier values, and who set them, are gone. With no Sentry DSN
     configured (ISS-012) the log lines are Vercel runtime logs, which age out.
     For money, "who set this to 5% and when" has to survive. */
  const desired: [SettingKey, string][] = [
    [SETTING_KEYS.cashbackPercent, d.cashbackPercent],
    [SETTING_KEYS.gstin, d.gstin],
    [SETTING_KEYS.expressMinutes, d.expressMinutes],
    [
      SETTING_KEYS.expressFeePaise,
      d.expressFeeRupees === "" ? "" : String(parseRupeeInput(d.expressFeeRupees)),
    ],
    [SETTING_KEYS.packSlaMinutes, d.packSlaMinutes],
    [SETTING_KEYS.deliverySlaMinutes, d.deliverySlaMinutes],
    [SETTING_KEYS.codEnabled, d.codEnabled],
    [SETTING_KEYS.defaultSort, d.defaultSort],
  ];

  const current = await readSettings();
  const changed = desired.filter(([key, value]) => (current[key] ?? "") !== value);

  if (changed.length === 0) {
    /* Nothing moved. No write, and no audit row saying a change happened. */
    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");
    return succeed(null);
  }

  await db.$transaction(async (tx) => {
    for (const [key, value] of changed) {
      await writeSetting(key, value, admin.email, tx);
    }

    /* Only what moved, both sides. The GSTIN's value is recorded here on
       purpose: it is the number printed on a customer's document, and "who
       changed it to what" is precisely the question an accountant asks. That
       is different from scattering it through log aggregation. */
    await recordAudit(tx, {
      actorType: "admin",
      actorId: admin.id,
      action: "settings.changed",
      entityType: "settings",
      entityId: "global",
      before: Object.fromEntries(changed.map(([key]) => [key, current[key] ?? null])),
      after: Object.fromEntries(changed),
    });
  });

  /* Settings reach the storefront, not just the console. */
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return succeed(null);
}
