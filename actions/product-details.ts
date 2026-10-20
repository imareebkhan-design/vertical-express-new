"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAdminUser } from "@/lib/services/admin/authz";
import { addVariant, saveProductDetails, setDefaultVariant, setVariantActive } from "@/lib/services/admin/product-details";
import { removeProductImage, setPrimaryImage } from "@/lib/services/admin/product-images";
import { parseRupeeInput } from "@/lib/money";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/** Product details, variants and photos from the console. Rules: lib/services/admin/product-details.ts, product-images.ts. */

async function revalidateProduct(productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  revalidatePath("/admin/products");
  revalidatePath("/admin/catalogue-approvals");
  if (p) {
    revalidatePath(`/admin/products/${p.slug}`);
    revalidatePath(`/product/${p.slug}`);
  }
  revalidatePath("/", "layout");
}

const detailsSchema = z.object({
  productId: z.uuid(),
  description: z.string().max(4000),
  unitLabel: z.string().max(40),
  specs: z.array(z.object({ label: z.string().max(60), value: z.string().max(200) })).max(40),
});

export async function adminSaveProductDetails(input: unknown): Promise<ActionResult<{ identityReset: boolean; commercialReset: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  const r = await saveProductDetails(parsed.data.productId, parsed.data, { id: admin.id, email: admin.email });
  if (!r.ok) return fail(r.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION", r.detail ?? "Product not found");
  await revalidateProduct(parsed.data.productId);
  return succeed({ identityReset: r.identityReset, commercialReset: r.commercialReset });
}

const variantSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  sku: z.string(),
  price: z.string(),
  mrp: z.string(),
  warehouseId: z.union([z.uuid(), z.literal("")]),
});

export async function adminAddVariant(input: unknown): Promise<ActionResult<{ variantId: string }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Those details are not valid");
  const pricePaise = parseRupeeInput(parsed.data.price);
  if (pricePaise === null) return fail("VALIDATION", "Enter the selling price in rupees, e.g. 398 or 398.50", "price");
  const compareAtPaise = parsed.data.mrp.trim() === "" ? null : parseRupeeInput(parsed.data.mrp);
  if (parsed.data.mrp.trim() !== "" && compareAtPaise === null) return fail("VALIDATION", "Enter the MRP in rupees, or leave it empty", "mrp");
  const r = await addVariant(
    parsed.data.productId,
    { name: parsed.data.name, sku: parsed.data.sku, pricePaise, compareAtPaise, warehouseId: parsed.data.warehouseId || null },
    { id: admin.id, email: admin.email }
  );
  if (!r.ok) {
    if (r.code === "SKU_TAKEN") return fail("CONFLICT", "Another variant already uses that SKU", "sku");
    if (r.code === "NOT_FOUND") return fail("NOT_FOUND", "Product not found");
    return fail("VALIDATION", r.detail ?? "Those details are not valid");
  }
  await revalidateProduct(parsed.data.productId);
  return succeed({ variantId: r.variantId });
}

const variantRef = z.object({ variantId: z.uuid() });

export async function adminSetVariantActive(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = variantRef.extend({ active: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Those details are not valid");
  const r = await setVariantActive(parsed.data.variantId, parsed.data.active, { id: admin.id, email: admin.email });
  if (!r.ok) {
    if (r.code === "IS_DEFAULT") return fail("CONFLICT", "This is the variant the product leads with. Make another one the default first.");
    return fail("NOT_FOUND", "Variant not found");
  }
  const v = await db.productVariant.findUnique({ where: { id: parsed.data.variantId }, select: { productId: true } });
  if (v) await revalidateProduct(v.productId);
  return succeed(null);
}

export async function adminSetDefaultVariant(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = variantRef.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Those details are not valid");
  const r = await setDefaultVariant(parsed.data.variantId, { id: admin.id, email: admin.email });
  if (!r.ok) return fail(r.code === "INACTIVE" ? "CONFLICT" : "NOT_FOUND", r.code === "INACTIVE" ? "A retired variant cannot lead. Restore it first." : "Variant not found");
  const v = await db.productVariant.findUnique({ where: { id: parsed.data.variantId }, select: { productId: true } });
  if (v) await revalidateProduct(v.productId);
  return succeed(null);
}

const imageRef = z.object({ imageId: z.uuid() });

export async function adminSetPrimaryImage(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = imageRef.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Those details are not valid");
  const img = await db.productImage.findUnique({ where: { id: parsed.data.imageId }, select: { productId: true } });
  const r = await setPrimaryImage(parsed.data.imageId, { id: admin.id, email: admin.email });
  if (!r.ok) return fail("NOT_FOUND", "Photo not found");
  if (img) await revalidateProduct(img.productId);
  return succeed(null);
}

export async function adminRemoveImage(input: unknown): Promise<ActionResult<{ wasPrimary: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = imageRef.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Those details are not valid");
  const img = await db.productImage.findUnique({ where: { id: parsed.data.imageId }, select: { productId: true } });
  const r = await removeProductImage(parsed.data.imageId, { id: admin.id, email: admin.email });
  if (!r.ok) return fail("NOT_FOUND", "Photo not found");
  if (img) await revalidateProduct(img.productId);
  return succeed({ wasPrimary: r.wasPrimary });
}
