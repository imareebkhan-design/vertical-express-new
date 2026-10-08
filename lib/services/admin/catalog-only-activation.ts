import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { catalogOnlyReason } from "@/lib/services/admin/publish-guard";

/**
 * Showing reviewed draft products as catalog-only (lib/catalog-visibility.ts).
 *
 * Input is an explicit list of slugs that passed identity/photo review — the
 * service never chooses products itself. For each slug:
 *
 *   draft         → CHANGE to catalog_only, if it has an approved exact primary
 *                   photo (licence + sha256 recorded by the image import)
 *   catalog_only  → REUSE (a re-run is a no-op)
 *   published     → SKIP (already for sale; never demoted by this tool)
 *   archived      → CONFLICT
 *   missing slug / no approved photo → CONFLICT
 *
 * Any conflict blocks the whole apply. Only the brands and categories that the
 * changed products need are activated — nothing else. Every change, and every
 * activation, is audited in the same transaction, and `catalogOnlyReason` is
 * re-checked for every product inside it, so a product that would fail the
 * guard can never be left visible. Prices, variants and stock are not touched.
 */
export interface CatalogOnlyPlan {
  change: { id: string; slug: string }[];
  reuse: string[];
  skip: string[];
  conflicts: { slug: string; reason: string }[];
  activateBrands: { id: string; slug: string }[];
  activateCategories: { id: string; slug: string }[];
}

export async function planCatalogOnly(slugs: readonly string[]): Promise<CatalogOnlyPlan> {
  const unique = [...new Set(slugs)];
  const rows = await db.product.findMany({
    where: { slug: { in: unique } },
    select: {
      id: true, slug: true, status: true,
      brand: { select: { id: true, slug: true, isActive: true } },
      category: { select: { id: true, slug: true, isActive: true } },
      images: { where: { isPrimary: true }, select: { licence: true, sha256: true } },
    },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const plan: CatalogOnlyPlan = { change: [], reuse: [], skip: [], conflicts: [], activateBrands: [], activateCategories: [] };
  const brands = new Map<string, { id: string; slug: string }>();
  const categories = new Map<string, { id: string; slug: string }>();

  for (const slug of unique) {
    const p = bySlug.get(slug);
    if (!p) { plan.conflicts.push({ slug, reason: "not in database" }); continue; }
    if (p.status === "catalog_only") { plan.reuse.push(slug); continue; }
    if (p.status === "published") { plan.skip.push(slug); continue; }
    if (p.status !== "draft") { plan.conflicts.push({ slug, reason: `status ${p.status}` }); continue; }
    const photo = p.images[0];
    if (!photo?.licence || !photo.sha256) { plan.conflicts.push({ slug, reason: "no approved exact primary photo" }); continue; }
    plan.change.push({ id: p.id, slug });
    if (!p.brand.isActive) brands.set(p.brand.id, { id: p.brand.id, slug: p.brand.slug });
    if (!p.category.isActive) categories.set(p.category.id, { id: p.category.id, slug: p.category.slug });
  }
  plan.activateBrands = [...brands.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  plan.activateCategories = [...categories.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return plan;
}

export async function applyCatalogOnly(slugs: readonly string[], source: Record<string, string>): Promise<CatalogOnlyPlan> {
  const plan = await planCatalogOnly(slugs);
  if (plan.conflicts.length) {
    throw new Error(`Catalog-only activation blocked by ${plan.conflicts.length} conflict(s); nothing written`);
  }
  if (!plan.change.length) return plan;

  await db.$transaction(
    async (tx) => {
      for (const b of plan.activateBrands) {
        await tx.brand.update({ where: { id: b.id }, data: { isActive: true } });
        await recordAudit(tx, { actorType: "system", action: "catalogue.brand_activated", entityType: "brand", entityId: b.id,
          before: { isActive: false }, after: { isActive: true, reason: "catalog_only activation", ...source } });
      }
      for (const c of plan.activateCategories) {
        await tx.category.update({ where: { id: c.id }, data: { isActive: true } });
        await recordAudit(tx, { actorType: "system", action: "catalogue.category_activated", entityType: "category", entityId: c.id,
          before: { isActive: false }, after: { isActive: true, reason: "catalog_only activation", ...source } });
      }
      for (const p of plan.change) {
        // Conditional on still being a draft: a concurrent change makes this fail loudly.
        const updated = await tx.product.updateMany({ where: { id: p.id, status: "draft" }, data: { status: "catalog_only" } });
        if (updated.count !== 1) throw new Error(`${p.slug} changed during activation; nothing written`);
        const why = await catalogOnlyReason(tx, p.id);
        if (why) throw new Error(`${p.slug}: ${why}; nothing written`);
        await recordAudit(tx, { actorType: "system", action: "catalogue.product_catalog_only", entityType: "product", entityId: p.id,
          before: { status: "draft" }, after: { status: "catalog_only", ...source } });
      }
    },
    { timeout: 300_000 }
  );
  return plan;
}
