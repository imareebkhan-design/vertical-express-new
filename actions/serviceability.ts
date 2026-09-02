"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { parseRupeeInput } from "@/lib/money";
import { parsePincodeCsv } from "@/lib/serviceability-csv";
import { savePincode, bulkSavePincodes, type BulkResult } from "@/lib/services/admin/serviceability-write";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Editing serviceability from the console.
 *
 * What this table says is what a customer is promised: whether we deliver to
 * them at all, what it costs, and whether they can pay cash. It was read-only
 * with a note saying it needed an audit trail before it could be written to.
 * The trail exists, so it can be.
 *
 * The ETA is the field to be careful with. It is a delivery promise, and no
 * delivery time has been confirmed by the owner — the express window is a
 * setting, deliberately empty. So blank is allowed here and means "no promise",
 * and blank must survive: the column defaults to 60 in the schema, which is the
 * unverified sixty-minute claim this project has already removed twice from
 * elsewhere.
 */
const editSchema = z.object({
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "A pincode is exactly six digits")
    .refine(
      (p) => /^1[89]/.test(p),
      "That pincode is outside Jammu & Kashmir, which is the only market"
    ),
  warehouseId: z.string().uuid("Pick a warehouse"),
  /** Blank means no promise. Never defaulted. */
  etaMinutes: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 20_160),
      "The delivery time must be a whole number of minutes, or blank for no promise"
    ),
  deliveryFee: z
    .string()
    .trim()
    .refine((v) => v === "" || parseRupeeInput(v) !== null, "That delivery fee is not a rupee amount"),
  codAllowed: z.boolean(),
  isActive: z.boolean(),
});

export async function adminSavePincode(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }
  const v = parsed.data;

  await savePincode(
    {
      pincode: v.pincode,
      warehouseId: v.warehouseId,
      etaMinutes: v.etaMinutes === "" ? 0 : Number(v.etaMinutes),
      deliveryFeePaise: v.deliveryFee === "" ? 0 : parseRupeeInput(v.deliveryFee)!,
      codAllowed: v.codAllowed,
      isActive: v.isActive,
    },
    admin.id
  );

  /* Serviceability reaches the storefront, not just this screen — a pincode
     going inactive has to stop being sellable immediately. */
  revalidatePath("/admin/serviceability");
  revalidatePath("/", "layout");
  return succeed(null);
}

/**
 * Bulk import.
 *
 * The file is parsed and validated in full before anything is written, and the
 * write is one transaction. A courier's coverage change is a single decision;
 * applying two-thirds of it leaves the map in a state nobody chose.
 */
export async function adminImportPincodes(
  csv: string
): Promise<ActionResult<BulkResult>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  if (typeof csv !== "string" || csv.length > 1_000_000) {
    return fail("VALIDATION", "That file is too large to import in one go");
  }

  const parsed = parsePincodeCsv(csv);
  if (!parsed.ok) {
    /* Every problem at once, with line numbers. Reporting only the first means
       a person fixes one row, re-uploads, and finds the next — for as many
       rounds as there are mistakes. */
    const shown = parsed.issues.slice(0, 12).map((i) => `Line ${i.line}: ${i.message}`);
    const more = parsed.issues.length - shown.length;
    return fail(
      "VALIDATION",
      shown.join("\n") + (more > 0 ? `\n…and ${more} more` : ""),
      undefined,
      { issues: parsed.issues }
    );
  }

  const res = await bulkSavePincodes(parsed.rows, admin.id);
  if (!res.ok) return fail("VALIDATION", res.error);

  revalidatePath("/admin/serviceability");
  revalidatePath("/", "layout");
  return succeed(res.result);
}
