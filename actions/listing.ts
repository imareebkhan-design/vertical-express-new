"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { parsePincodeList } from "@/lib/pincode";
import { parseRupeeInput } from "@/lib/money";
import { createProduct } from "@/lib/services/admin/product-create";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Listing a new product from the console.
 *
 * The one business fact this form must not get wrong is the price, so both
 * money fields go through parseRupeeInput rather than Number(): a blank field
 * coercing to zero would list something as free, and "1e3" would list it at a
 * thousand rupees. Neither is caught by review, because both look like numbers.
 *
 * The MRP check is the other one worth having. A struck-through price below the
 * selling price renders as a negative discount, and a struck-through price
 * equal to it is a discount badge saying nothing — both are the shop lying
 * quietly about a saving. Above or absent, nothing else.
 */
const schema = z
  .object({
    title: z.string().trim().min(4, "A product needs a name").max(160),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[a-z0-9-]+$/, "The slug may use lowercase letters, numbers and hyphens only"),
    brandId: z.string().uuid("Pick a brand"),
    categoryId: z.string().uuid("Pick a category"),
    description: z.string().trim().max(2000).optional(),
    unitLabel: z.string().trim().min(1).max(40),
    deliverySpeed: z.enum(["express", "scheduled", ""]),
    status: z.enum(["draft", "published"]),

    variantName: z.string().trim().min(1, "The variant needs a name").max(80),
    sku: z
      .string()
      .trim()
      .min(3, "A SKU needs at least three characters")
      .max(48)
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, "SKUs use capitals, digits and hyphens"),
    price: z.string().trim(),
    mrp: z.string().trim(),

    warehouseId: z.string().trim(),
    openingStock: z.string().trim(),

    /* The 60-minute run. Comma or newline separated in the form, because an
       operator setting up a product types a list rather than adding rows. */
    expressEligible: z.boolean(),
    expressPincodes: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });

    const price = parseRupeeInput(v.price);
    if (price === null) bad("The selling price is not a rupee amount");
    else if (price <= 0) bad("The selling price must be more than zero");

    if (v.mrp !== "") {
      const mrp = parseRupeeInput(v.mrp);
      if (mrp === null) bad("The MRP is not a rupee amount");
      else if (price !== null && mrp <= price) {
        bad("The MRP must be above the selling price, or left blank");
      }
    }

    if (v.openingStock !== "") {
      const n = Number(v.openingStock);
      if (!Number.isInteger(n) || n < 0) bad("Opening stock must be a whole number");
      else if (n > 0 && v.warehouseId === "") bad("Pick the warehouse the stock is in");
    }

    const pins = parsePincodeList(v.expressPincodes);
    if (v.expressEligible && pins.valid.length === 0) {
      bad("60-minute delivery is on, so list the pincodes it covers");
    }
    if (pins.invalid.length > 0) {
      bad(`Not a pincode: ${pins.invalid.slice(0, 3).join(", ")}`);
    }
  });



export async function adminListProduct(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }
  const v = parsed.data;

  const qty = v.openingStock === "" ? 0 : Number(v.openingStock);

  const res = await createProduct(
    {
      title: v.title,
      slug: v.slug,
      brandId: v.brandId,
      categoryId: v.categoryId,
      description: v.description?.trim() || null,
      unitLabel: v.unitLabel,
      express: {
        eligible: v.expressEligible,
        /* Off means off, whatever is in the list — so turning it off does not
           discard the pincodes it was set up with when it is turned back on. */
        pincodes: v.expressEligible ? parsePincodeList(v.expressPincodes).valid : [],
      },
      deliverySpeed: v.deliverySpeed === "" ? null : v.deliverySpeed,
      status: v.status,
      variant: {
        name: v.variantName,
        sku: v.sku,
        pricePaise: parseRupeeInput(v.price)!,
        compareAtPaise: v.mrp === "" ? null : parseRupeeInput(v.mrp)!,
      },
      /* An inventory row is created even at zero, so the variant is adjustable
         from the inventory screen straight away. Without one it reads as out
         of stock with no row to change. */
      openingStock: v.warehouseId ? { warehouseId: v.warehouseId, qty } : null,
    },
    { id: admin.id, email: admin.email }
  );

  if (!res.ok) {
    if (res.error === "not_sellable") return fail("VALIDATION", `Not ready to sell: ${res.reasons.join("; ")}. Save it as a draft instead.`);
    if (res.error === "slug_taken") return fail("CONFLICT", "That slug is already in use");
    if (res.error === "sku_taken") return fail("CONFLICT", "That SKU is already in use");
    return fail("CONFLICT", "That product could not be created");
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/listing");
  revalidatePath("/", "layout");
  return succeed({ slug: res.slug });
}
