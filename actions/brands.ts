"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/services/admin/authz";
import { log } from "@/lib/observability";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Managing the brands the catalogue sells.
 *
 * The catalogue shipped with ten invented brands — BuildPro, GripFast,
 * HomeCrown and so on — because there was no way to enter real ones. A brand on
 * a product page is a factual claim about what is in the bag, so it belongs to
 * whoever buys the stock, not to a seed file.
 *
 * Names only. Logos and packaging photography are licensed separately from the
 * right to say you stock something, and nothing here uploads an image until the
 * owner confirms what their agreements actually permit (ISS-044).
 */
const schema = z.object({
  name: z.string().trim().min(2, "A brand needs a name").max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "The slug may use lowercase letters, numbers and hyphens only"),
  isActive: z.boolean(),
  /**
   * The slug of the brand being edited, or absent when adding a new one.
   *
   * THIS FIELD IS THE WHOLE FIX. The previous version ran
   * `upsert({ where: { slug } })` for both cases, which meant adding a brand
   * whose slug collided with an existing one did not fail — it silently
   * RENAMED the existing brand. Type "UltraTech Cement" with the slug
   * `ultratech` and the UltraTech every product page already names becomes
   * something else, on every one of those pages, with a success message.
   *
   * The catch below claimed to handle that and could not: an upsert keyed on
   * slug never raises a slug conflict. Only a name collision threw, so exactly
   * half the duplicates were caught and the more destructive half was not.
   *
   * Create and edit are now separate operations. Create inserts and lets the
   * unique constraint refuse a duplicate; edit targets a row the caller has
   * explicitly named.
   */
  originalSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export async function adminSaveBrand(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }

  const { name, slug, isActive, originalSlug } = parsed.data;

  if (originalSlug) {
    const existing = await db.brand.findUnique({
      where: { slug: originalSlug },
      select: { slug: true, name: true },
    });
    if (!existing) return fail("NOT_FOUND", "That brand no longer exists");

    try {
      await db.brand.update({
        where: { slug: originalSlug },
        data: { name, slug, isActive },
      });
    } catch {
      return fail("CONFLICT", "Another brand already uses that name or slug");
    }

    /* A slug change breaks every catalogue URL filtered by this brand, and a
       name change rewrites what every one of its product pages claims to be.
       Both are worth being able to look up later. */
    log("INFO", {
      service: "catalog",
      event: "brand_edited",
      metadata: {
        slugFrom: existing.slug,
        slugTo: slug,
        nameFrom: existing.name,
        nameTo: name,
        editedBy: admin.email,
      },
    });
  } else {
    try {
      await db.brand.create({ data: { slug, name, isActive } });
    } catch {
      /* Both name and slug are unique. Either collision means the brand is
         already here — which is a thing to say, not a thing to overwrite. */
      return fail("CONFLICT", "A brand with that name or slug already exists");
    }

    log("INFO", {
      service: "catalog",
      event: "brand_created",
      metadata: { slug, createdBy: admin.email },
    });
  }

  revalidatePath("/admin/brands");
  revalidatePath("/", "layout");
  return succeed(null);
}

/**
 * Retiring a brand rather than deleting it.
 *
 * Deleting would cascade to its products, which is never what somebody means
 * when they say a brand is discontinued — the orders that reference those
 * products still have to make sense. Inactive hides it from the storefront and
 * leaves history intact.
 */
export async function adminSetBrandActive(slug: string, isActive: boolean): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  await db.brand.update({ where: { slug }, data: { isActive } });
  revalidatePath("/admin/brands");
  revalidatePath("/", "layout");
  return succeed(null);
}

/**
 * Assigning a product to a brand.
 *
 * The one operation that turns a fictional catalogue into a real one, and the
 * one that must never be automated. Which brand a product actually is, is a
 * fact about what sits on the warehouse floor — a bag of cement is an UltraTech
 * or an ACC, and no amount of name similarity settles which. Getting it wrong
 * puts a false statement in front of somebody buying material for a slab.
 *
 * So this exists to be used deliberately, one product at a time, by a person
 * who knows what they bought. Nothing calls it in bulk.
 *
 * `brandId` is required on Product — it always has been, and every product
 * already has one — so this is a reassignment rather than a nullable edit. That
 * is why no migration was needed.
 */
const assignSchema = z.object({
  productId: z.string().uuid(),
  brandId: z.string().uuid(),
});

export async function adminAssignProductBrand(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "That product or brand is not valid");

  const { productId, brandId } = parsed.data;

  const [product, brand] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { id: true, brandId: true, title: true } }),
    db.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } }),
  ]);
  if (!product) return fail("NOT_FOUND", "Product not found");
  if (!brand) return fail("NOT_FOUND", "Brand not found");
  if (product.brandId === brandId) return succeed(null);

  await db.product.update({ where: { id: productId }, data: { brandId } });

  /* A brand change is a change to what the product claims to be, so it leaves a
     trail. The previous brand is recorded because "it used to say something
     else" is the question somebody asks later. */
  log("INFO", {
    service: "catalog",
    event: "product_brand_assigned",
    metadata: {
      productId,
      from: product.brandId,
      to: brandId,
      brandName: brand.name,
      assignedBy: admin.email,
    },
  });

  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  return succeed(null);
}
