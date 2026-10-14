"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { parseRupeeInput } from "@/lib/money";
import { parsePincodeCsv } from "@/lib/serviceability-csv";
import {
  savePincode,
  bulkSavePincodes,
  createCity,
  setCityLive,
  includePincodes,
  setPincodeIncluded,
  type BulkResult,
} from "@/lib/services/admin/serviceability-write";
import { INDIA_PINCODE, parseServicePincodes } from "@/lib/pincode";
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
  pincode: z.string().trim().regex(INDIA_PINCODE, "A pincode is six digits and does not start with 0"),
  cityId: z.string().uuid("Pick the city this pincode belongs to"),
  area: z.string().trim().max(80),
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
      cityId: v.cityId,
      area: v.area === "" ? null : v.area,
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
  csv: string,
  cityId: string
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

  if (!z.string().uuid().safeParse(cityId).success) return fail("VALIDATION", "Pick the city this file is for");
  const res = await bulkSavePincodes(parsed.rows, admin.id, cityId);
  if (!res.ok) return fail("VALIDATION", res.error);

  revalidatePath("/admin/serviceability");
  revalidatePath("/", "layout");
  return succeed(res.result);
}

function revalidateAreas() {
  revalidatePath("/admin/serviceability");
  revalidatePath("/", "layout");
}

const citySchema = z.object({
  name: z.string().trim().min(2, "Name the city").max(60),
  state: z.string().trim().min(2, "Name the state — it decides GST").max(60),
});

/** Add a city. It starts switched off: adding it promises nobody anything. */
export async function adminCreateCity(input: unknown): Promise<ActionResult<{ id: string }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = citySchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  const r = await createCity(parsed.data, admin.id);
  if (!r.ok) return fail("VALIDATION", r.message);
  revalidateAreas();
  return succeed(r.value);
}

/** Go live in a city, or switch it off. Off keeps its pincodes for next time. */
export async function adminSetCityLive(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = z.object({ cityId: z.string().uuid(), isLive: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Pick a city");
  const r = await setCityLive(parsed.data.cityId, parsed.data.isLive, admin.id);
  if (!r.ok) return fail("NOT_FOUND", r.message);
  revalidateAreas();
  return succeed(null);
}

const includeSchema = z.object({
  cityId: z.string().uuid("Pick a city"),
  pincodes: z.string().max(20_000),
  warehouseId: z.string().uuid("Pick a warehouse"),
  area: z.string().trim().max(80),
  etaMinutes: editSchema.shape.etaMinutes,
  deliveryFee: editSchema.shape.deliveryFee,
  codAllowed: z.boolean(),
});

/** Include pincodes (a list and/or ranges) in a city, all with one set of terms. */
export async function adminIncludePincodes(input: unknown): Promise<ActionResult<BulkResult & { skippedExcluded: string[] }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = includeSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  const v = parsed.data;
  const list = parseServicePincodes(v.pincodes);
  if (list.invalid.length > 0) return fail("VALIDATION", `Not a pincode: ${list.invalid.slice(0, 10).join(", ")}`);
  if (list.tooLarge.length > 0) return fail("VALIDATION", `Range too large (max 200 at a time): ${list.tooLarge.join(", ")}`);
  if (list.valid.length === 0) return fail("VALIDATION", "Add at least one pincode");
  const r = await includePincodes(
    v.cityId,
    list.valid,
    {
      warehouseId: v.warehouseId,
      area: v.area === "" ? null : v.area,
      etaMinutes: v.etaMinutes === "" ? 0 : Number(v.etaMinutes),
      deliveryFeePaise: v.deliveryFee === "" ? 0 : parseRupeeInput(v.deliveryFee)!,
      codAllowed: v.codAllowed,
    },
    admin.id
  );
  if (!r.ok) return fail("VALIDATION", r.message);
  revalidateAreas();
  return succeed(r.value);
}

/** Exclude one pincode (or include it again) without touching its terms. */
export async function adminSetPincodeIncluded(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = z.object({ pincode: z.string().regex(INDIA_PINCODE), isActive: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "That is not a pincode");
  const r = await setPincodeIncluded(parsed.data.pincode, parsed.data.isActive, admin.id);
  if (!r.ok) return fail("NOT_FOUND", r.message);
  revalidateAreas();
  return succeed(null);
}
