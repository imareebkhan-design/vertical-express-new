import "server-only";
import { Prisma, type CategoryGroup } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";

/**
 * Categories from the console (handover, 19 Oct 2026).
 *
 * Until now a category could only be created or renamed by a seed, an import
 * or a deploy. The owner's staff need to do it themselves.
 *
 * What stays fixed, deliberately:
 *   - the SLUG, once created. Checkout tax (`CATEGORY_TAX_CONFIGS`), the curated
 *     department directory (`lib/category-directory.ts`) and every saved URL are
 *     keyed by it; renaming it would silently drop a category's HSN/GST and
 *     break links. A different slug is a new category.
 *   - tax. A new category has no HSN/GST until one is confirmed and added in
 *     code, and the publish gate refuses to sell anything in it until then
 *     (`publish-guard.ts`). It can still be browsed (catalogue-only).
 *
 * Switching a category off hides every product in it from the storefront
 * (`catalogIdentityWhere` requires an active category) without changing any
 * product's status, so switching it back on restores exactly what was there.
 */

export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  "civil_interiors",
  "furniture_hardware",
  "electrical",
  "plumbing_bath",
  "tools",
  "other",
];

export interface CategoryInput {
  slug: string;
  name: string;
  group: CategoryGroup;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}

export type SaveCategoryResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; code: "SLUG_TAKEN" | "NAME_TAKEN" | "NOT_FOUND" };

/** Every category with what it holds, for the console. */
export async function adminListCategories() {
  const [rows, counts] = await Promise.all([
    db.category.findMany({ orderBy: [{ isActive: "desc" }, { group: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    db.product.groupBy({ by: ["categoryId", "status"], _count: { _all: true } }),
  ]);
  return rows.map((c) => {
    const byStatus: Record<string, number> = {};
    for (const r of counts) if (r.categoryId === c.id) byStatus[r.status] = r._count._all;
    return {
      ...c,
      productCount: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      hasTaxMapping: Boolean(CATEGORY_TAX_CONFIGS[c.slug]),
    };
  });
}

/**
 * Create a category (`existingSlug` absent) or edit one. On edit the slug is
 * the key and cannot change. Audited in the same transaction.
 */
export async function saveCategory(
  input: CategoryInput,
  actor: { id?: string | null; email: string },
  existingSlug?: string
): Promise<SaveCategoryResult> {
  const name = input.name.trim();
  try {
    return await db.$transaction(async (tx) => {
      const sameName = await tx.category.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, ...(existingSlug ? { slug: { not: existingSlug } } : {}) },
        select: { id: true },
      });
      if (sameName) return { ok: false as const, code: "NAME_TAKEN" as const };

      const data = {
        name,
        group: input.group,
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        seoTitle: input.seoTitle?.trim() || null,
        seoDescription: input.seoDescription?.trim() || null,
      };

      if (!existingSlug) {
        const created = await tx.category.create({ data: { ...data, slug: input.slug }, select: { id: true } });
        await recordAudit(tx, {
          actorType: "admin",
          actorId: actor.id ?? null,
          action: "catalogue.category_created",
          entityType: "category",
          entityId: created.id,
          after: { slug: input.slug, ...data, by: actor.email },
        });
        return { ok: true as const, id: created.id, created: true };
      }

      const before = await tx.category.findUnique({ where: { slug: existingSlug } });
      if (!before) return { ok: false as const, code: "NOT_FOUND" as const };
      await tx.category.update({ where: { id: before.id }, data });
      const changed = Object.fromEntries(
        (Object.keys(data) as (keyof typeof data)[])
          .filter((k) => before[k] !== data[k])
          .map((k) => [k, { from: before[k], to: data[k] }])
      );
      await recordAudit(tx, {
        actorType: "admin",
        actorId: actor.id ?? null,
        action: "catalogue.category_edited",
        entityType: "category",
        entityId: before.id,
        after: { slug: existingSlug, changed, by: actor.email } as Prisma.InputJsonValue,
      });
      return { ok: true as const, id: before.id, created: false };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, code: "SLUG_TAKEN" };
    throw e;
  }
}
