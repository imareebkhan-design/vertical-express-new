"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import { CATEGORY_GROUPS, saveCategory } from "@/lib/services/admin/categories";
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
