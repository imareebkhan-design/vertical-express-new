"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/services/admin/authz";
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
 * artboard draws. Prices and stock live on variants and warehouses and have
 * their own correctness rules — pricing is server-authoritative for a reason,
 * and a text box on this screen is not where that should be relaxed.
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
  status: z.enum(["draft", "published", "archived"]),
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
