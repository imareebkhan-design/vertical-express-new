"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/prisma/generated/client/client";
import { getAdminUser } from "@/lib/services/admin/authz";
import { log } from "@/lib/observability";
import { editBrand, setBrandActive, assignProductBrand, createBrand } from "@/lib/services/admin/brand-writes";
import { brandSlug } from "@/lib/services/admin/taxonomy-slug";
import { removeBrandLogo } from "@/lib/services/admin/brand-logos";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Managing the brands the catalogue sells.
 *
 * The catalogue shipped with ten invented brands — BuildPro, GripFast,
 * HomeCrown and so on — because there was no way to enter real ones. A brand on
 * a product page is a factual claim about what is in the bag, so it belongs to
 * whoever buys the stock, not to a seed file.
 *
 * Logos are separate (lib/services/admin/brand-logos.ts): a name is the right
 * to say you stock something, a logo is artwork licensed on its own terms, so
 * a logo is stored only with the operator's declaration of the right to use it
 * and the licence it is used under (issue #7, ISS-044).
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
    let existing;
    try {
      existing = await editBrand(originalSlug, { name, slug, isActive }, admin);
      if (!existing) return fail("NOT_FOUND", "That brand no longer exists");
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && error.meta?.modelName === "Brand") {
        return fail("CONFLICT", "Another brand already uses that name or slug");
      }
      throw error;
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
    /* Both name and slug are unique. Either collision means the brand is
       already here — which is a thing to say, not a thing to overwrite. */
    const created = await createBrand({ name, slug, isActive }, admin);
    if (!created.ok) return fail("CONFLICT", "A brand with that name or slug already exists");

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

  if (!z.boolean().safeParse(isActive).success) return fail("VALIDATION", "Choose whether the brand is active");
  const result = await setBrandActive(slug, isActive, admin);
  if (result === "missing") return fail("NOT_FOUND", "That brand no longer exists");
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

  const result = await assignProductBrand(productId, brandId, admin);
  if (!result.ok) return fail("NOT_FOUND", result.detail);
  if (!result.changed) {
    revalidatePath("/admin/products");
    revalidatePath("/", "layout");
    return succeed(null);
  }
  const { product, brand } = result;

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

/**
 * "+ New brand" on the product form (issue #7): create a brand without leaving
 * the draft being typed, and hand back what the form needs to select it.
 *
 * Name only; the slug is derived here, so the two forms of creation cannot
 * disagree about what a slug is. Active, like a brand added on the Brands page:
 * a brand is shown to customers only once a published product carries it
 * (lib/services/catalog.ts brandsInCategory / brandsForSearchEntry), so making
 * it selectable publishes nothing.
 */
const quickBrandSchema = z.object({ name: schema.shape.name });

export async function adminQuickAddBrand(
  input: unknown
): Promise<ActionResult<{ id: string; name: string; slug: string; logoUrl: string | null }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = quickBrandSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That name is not valid");
  const name = parsed.data.name;
  const slug = brandSlug(name);
  if (slug.length < 2) return fail("VALIDATION", "A brand name needs at least two letters or numbers");

  const created = await createBrand({ name, slug, isActive: true }, admin, "product_form");
  if (!created.ok) {
    /* Say which brand is already there, so the operator can simply pick it. */
    const existing = await db.brand.findFirst({
      where: { OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }] },
      select: { name: true, isActive: true },
    });
    return fail(
      "CONFLICT",
      existing
        ? existing.isActive
          ? `"${existing.name}" already exists. Choose it from the list.`
          : `"${existing.name}" already exists but is retired. Restore it on the Brands page to use it.`
        : "A brand with that name already exists"
    );
  }
  log("INFO", { service: "catalog", event: "brand_created", metadata: { slug, createdBy: admin.email, source: "product_form" } });
  revalidatePath("/admin/brands");
  revalidatePath("/admin/listing");
  return succeed({ id: created.brand.id, name: created.brand.name, slug: created.brand.slug, logoUrl: null });
}

/** Take a brand's logo off (issue #7). The audit row keeps the URL removed. */
export async function adminRemoveBrandLogo(slug: unknown): Promise<ActionResult<{ removed: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = z.string().trim().regex(/^[a-z0-9-]+$/).safeParse(slug);
  if (!parsed.success) return fail("VALIDATION", "That is not a brand");
  const result = await removeBrandLogo(parsed.data, admin);
  if (result === "missing") return fail("NOT_FOUND", "That brand no longer exists");
  revalidatePath("/admin/brands");
  revalidatePath("/admin/listing");
  return succeed({ removed: result === "removed" });
}
