"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { CATEGORY_GROUPS, saveCategory, setCategoryActive } from "@/lib/services/admin/categories";
import { categorySlug } from "@/lib/services/admin/taxonomy-slug";
import { productTypeLabel } from "@/lib/services/admin/product-create";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/** Creating and editing categories from the console. Rules: lib/services/admin/categories.ts. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s));

const schema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "The slug may use lowercase letters, numbers and single hyphens only"),
  name: z.string().trim().min(2, "A category needs a name").max(80),
  group: z.enum(CATEGORY_GROUPS as [string, ...string[]]),
  description: optionalText(600),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isActive: z.boolean(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
  /** Present when editing: the slug being edited (which cannot change). */
  existingSlug: z.string().trim().optional(),
});

export async function adminSaveCategory(input: unknown): Promise<ActionResult<{ created: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  const { existingSlug, ...data } = parsed.data;
  if (existingSlug && existingSlug !== data.slug) {
    return fail("VALIDATION", "A category's slug cannot change: tax, links and the department directory depend on it");
  }

  const result = await saveCategory(
    { ...data, group: data.group as (typeof CATEGORY_GROUPS)[number] },
    { id: admin.id, email: admin.email },
    existingSlug
  );
  if (!result.ok) {
    if (result.code === "NOT_FOUND") return fail("NOT_FOUND", "That category no longer exists");
    if (result.code === "NAME_TAKEN") return fail("CONFLICT", "Another category already has that name");
    return fail("CONFLICT", "Another category already uses that slug");
  }

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath(`/category/${data.slug}`);
  revalidatePath("/", "layout");
  return succeed({ created: result.created });
}

/** Show or hide one category. Products keep their status; see `setCategoryActive`. */
export async function adminSetCategoryActive(slug: unknown, isActive: unknown): Promise<ActionResult<{ changed: boolean }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsedSlug = schema.shape.slug.safeParse(slug);
  if (!parsedSlug.success) return fail("VALIDATION", "That is not a category slug");
  const parsedActive = z.boolean().safeParse(isActive);
  if (!parsedActive.success) return fail("VALIDATION", "Choose whether the category is shown");

  const result = await setCategoryActive(parsedSlug.data, parsedActive.data, { id: admin.id, email: admin.email });
  if (result === "missing") return fail("NOT_FOUND", "That category no longer exists");

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath(`/category/${parsedSlug.data}`);
  revalidatePath("/", "layout");
  return succeed({ changed: result === "changed" });
}

/**
 * "+ New category" on the product form (issue #7).
 *
 * Creates the category HIDDEN (isActive false) and hands back what the form
 * needs to select it, so a draft can be filed under it straight away while the
 * category itself stays off the storefront until the owner shows it on the
 * Categories page. It has no tax mapping until an HSN/GST rate is confirmed and
 * added in code; the form says "Not configured", and the publish check refuses
 * to sell anything in it until then (lib/services/admin/publish-guard.ts).
 * Nothing about a draft depends on either.
 *
 * The department group is chosen, never guessed: it decides where the category
 * is listed once shown.
 */
const quickSchema = z.object({
  name: schema.shape.name,
  group: schema.shape.group,
});

export async function adminQuickAddCategory(input: unknown): Promise<
  ActionResult<{
    id: string;
    name: string;
    slug: string;
    group: string;
    isBulk: boolean;
    isActive: boolean;
    hsn: string | null;
    gstRatePct: number | null;
    typeLabel: string;
  }>
> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");
  const parsed = quickSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  const name = parsed.data.name;
  const slug = categorySlug(name);
  if (!schema.shape.slug.safeParse(slug).success) return fail("VALIDATION", "A category name needs at least two letters or numbers");

  const result = await saveCategory(
    {
      slug,
      name,
      group: parsed.data.group as (typeof CATEGORY_GROUPS)[number],
      description: null,
      sortOrder: 0,
      isActive: false,
      seoTitle: null,
      seoDescription: null,
    },
    { id: admin.id, email: admin.email }
  );
  if (!result.ok) {
    if (result.code === "NAME_TAKEN") return fail("CONFLICT", `A category called "${name}" already exists. Choose it from the list.`);
    return fail("CONFLICT", `The web address "${slug}" is already used by another category. Choose it from the list, or use a different name.`);
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/listing");
  /* Own-property lookup: the slug is derived from operator input. */
  const tax = new Map(Object.entries(CATEGORY_TAX_CONFIGS)).get(slug);
  return succeed({
    id: result.id,
    name,
    slug,
    group: parsed.data.group,
    isBulk: false,
    isActive: false,
    hsn: tax?.hsn ?? null,
    gstRatePct: tax?.ratePct ?? null,
    typeLabel: productTypeLabel(slug),
  });
}
