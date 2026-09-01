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
});

export async function adminSaveBrand(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }

  const { name, slug, isActive } = parsed.data;

  try {
    await db.brand.upsert({
      where: { slug },
      create: { slug, name, isActive },
      update: { name, isActive },
    });
  } catch {
    /* name and slug are both unique. The likely collision is a second brand
       claiming an existing name, which is worth saying plainly rather than
       returning a generic failure. */
    return fail("CONFLICT", "A brand with that name or slug already exists");
  }

  log("INFO", {
    service: "catalog",
    event: "brand_saved",
    metadata: { slug, updatedBy: admin.email },
  });

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
