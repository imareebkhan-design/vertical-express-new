"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/services/admin/authz";
import { catalogOnlyReason, unpublishableReason } from "@/lib/services/admin/publish-guard";
import { setVariantPrice } from "@/lib/services/admin/variant-pricing";
import { parseRupeeInput } from "@/lib/money";
import { log } from "@/lib/observability";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Editing a product from the console.
 *
 * The catalogue was read-only: a product's name, status, brand and delivery
 * speed could only be changed by editing a seed file and deploying. That is the
 * same problem as the hardcoded cashback rate — a decision that belongs to
 * whoever runs the shop, locked behind an engineer.
 *
 * Scope is deliberately the fields a shopkeeper changes, not everything the
 * artboard draws. Prices live on variants and have their own correctness rules,
 * so they are changed through `adminSetVariantPrice` below — parsed on the
 * server, refused from a stale screen, and audited in the same transaction.
 * Stock is not editable here.
 */
const schema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3, "A product needs a name").max(160),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "The slug may use lowercase letters, numbers and hyphens only"),
  brandId: z.string().uuid(),
  status: z.enum(["draft", "catalog_only", "published", "archived"]),
  /** Empty string means "inherit from the category", which is right for most rows. */
  deliverySpeed: z.enum(["express", "scheduled", ""]),
});

export async function adminSaveProduct(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }

  const { id, title, slug, brandId, status, deliverySpeed } = parsed.data;

  const before = await db.product.findUnique({
    where: { id },
    select: { slug: true, status: true, brandId: true, deliverySpeed: true },
  });
  if (!before) return fail("NOT_FOUND", "Product not found");

  if (status === "published" || status === "catalog_only") {
    const why = status === "published" ? await unpublishableReason(db, id) : await catalogOnlyReason(db, id);
    if (why) return fail("VALIDATION", why);
  }

  try {
    await db.product.update({
      where: { id },
      data: {
        title,
        slug,
        brandId,
        status,
        deliverySpeed: deliverySpeed === "" ? null : deliverySpeed,
      },
    });
  } catch {
    return fail("CONFLICT", "Another product already uses that slug");
  }

  /* A slug change breaks every link anybody saved or shared, so it is recorded
     with what it was. The brand change is recorded for the same reason it is on
     its own action: it changes what the product claims to be. */
  log("INFO", {
    service: "catalog",
    event: "product_edited",
    metadata: {
      id,
      slugFrom: before.slug,
      slugTo: slug,
      statusFrom: before.status,
      statusTo: status,
      brandChanged: before.brandId !== brandId,
      speedFrom: before.deliverySpeed,
      speedTo: deliverySpeed || null,
      editedBy: admin.email,
    },
  });

  revalidatePath("/admin/products");
  revalidatePath(`/product/${before.slug}`);
  revalidatePath(`/product/${slug}`);
  revalidatePath("/", "layout");
  return succeed(null);
}

/**
 * Changing a variant's price (ISS-068). Rupee amounts arrive as the text the
 * operator typed and are parsed here, on the server; the form also sends the
 * amounts it displayed, so a save made from a stale screen is refused rather
 * than overwriting a newer change. The rules and the audit row live in
 * `setVariantPrice`.
 */
const priceSchema = z.object({
  variantId: z.string().uuid(),
  price: z.string().trim(),
  mrp: z.string().trim(),
  shownPricePaise: z.number().int(),
  shownCompareAtPaise: z.number().int().nullable(),
});

export async function adminSetVariantPrice(
  input: unknown
): Promise<ActionResult<{ changed: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Those details are not valid");
  const { variantId, price, mrp, shownPricePaise, shownCompareAtPaise } = parsed.data;

  const pricePaise = parseRupeeInput(price);
  if (pricePaise === null) return fail("VALIDATION", "The selling price is not a rupee amount");
  let compareAtPaise: number | null = null;
  if (mrp !== "") {
    compareAtPaise = parseRupeeInput(mrp);
    if (compareAtPaise === null) return fail("VALIDATION", "The MRP is not a rupee amount");
  }

  const res = await setVariantPrice(
    {
      variantId,
      pricePaise,
      compareAtPaise,
      expected: { pricePaise: shownPricePaise, compareAtPaise: shownCompareAtPaise },
    },
    admin
  );
  if (!res.ok) {
    if (res.reason === "invalid") return fail("VALIDATION", res.message);
    if (res.reason === "not_found") return fail("NOT_FOUND", "Variant not found");
    return fail("CONFLICT", "This price was changed by someone else. Reload to see the current price.");
  }

  if (res.changed) {
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${res.productSlug}`);
    revalidatePath(`/product/${res.productSlug}`);
    revalidatePath("/", "layout");
  }
  return succeed({ changed: res.changed });
}
