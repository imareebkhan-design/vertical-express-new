import "server-only";
import { db } from "@/lib/db";
import { recordAudit, type DbClient } from "@/lib/services/audit";
import { catalogOnlyReason } from "@/lib/services/admin/publish-guard";
import { approvedImageWhere, catalogIdentityWhere } from "@/lib/catalog-policy";
import { catalogOnlySelectionSchema, type CatalogOnlySelection } from "@/lib/catalog-only-batch";

/**
 * Showing reviewed draft products as catalog-only (lib/catalog-visibility.ts).
 *
 * Input is an explicit list of slugs that passed identity/photo review — the
 * service never chooses products itself. For each slug:
 *
 *   draft         → CHANGE to catalog_only, if it has an approved exact primary
 *                   photo and confirmed product identity
 *   catalog_only  → REUSE only after checking current approval again
 *   published     → SKIP (already for sale; never demoted by this tool)
 *   archived      → CONFLICT
 *   missing slug / no approved photo → CONFLICT
 *
 * Any conflict blocks the whole apply. Brands/categories must already be active;
 * this operation cannot infer permission to activate them. Planning, including
 * reuse validation, and writes share one serializable transaction. Prices,
 * variants and stock are not touched.
 */
export interface CatalogOnlyPlan {
  change: { id: string; slug: string }[];
  reuse: string[];
  skip: string[];
  conflicts: { slug: string; reason: string }[];
  activateBrands: { id: string; slug: string }[];
  activateCategories: { id: string; slug: string }[];
}

export async function planCatalogOnly(selection: readonly CatalogOnlySelection[], client: DbClient = db): Promise<CatalogOnlyPlan> {
  const selected = catalogOnlySelectionSchema.parse(selection);
  const unique = selected.map(row => row.slug);
  const hashes = new Map(selected.map(row => [row.slug, row.imageSha256]));
  const rows = await client.product.findMany({
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

  for (const slug of unique) {
    const p = bySlug.get(slug);
    if (!p) { plan.conflicts.push({ slug, reason: "not in database" }); continue; }
    if (p.status === "published") { plan.skip.push(slug); continue; }
    if (p.status !== "draft" && p.status !== "catalog_only") { plan.conflicts.push({ slug, reason: `status ${p.status}` }); continue; }
    const eligible = await client.product.findFirst({ where: { id: p.id, AND: [catalogIdentityWhere(), {
      images: { some: { isPrimary: true, ...approvedImageWhere(), sha256: hashes.get(slug) } },
    }] }, select: { id: true } });
    if (!eligible) { plan.conflicts.push({ slug, reason: "identity/image approval, reviewed image checksum or active brand/category missing" }); continue; }
    if (p.status === "catalog_only") { plan.reuse.push(slug); continue; }
    plan.change.push({ id: p.id, slug });
  }
  return plan;
}

export async function applyCatalogOnly(selection: readonly CatalogOnlySelection[], source: Record<string, string>): Promise<CatalogOnlyPlan> {
  return db.$transaction(
    async (tx) => {
      const plan = await planCatalogOnly(selection, tx);
      if (plan.conflicts.length) {
        throw new Error(`Catalog-only activation blocked by ${plan.conflicts.length} conflict(s); nothing written`);
      }
      for (const p of plan.change) {
        // Conditional on still being a draft: a concurrent change makes this fail loudly.
        const updated = await tx.product.updateMany({ where: { id: p.id, status: "draft" }, data: { status: "catalog_only" } });
        if (updated.count !== 1) throw new Error(`${p.slug} changed during activation; nothing written`);
        const why = await catalogOnlyReason(tx, p.id);
        if (why) throw new Error(`${p.slug}: ${why}; nothing written`);
        await recordAudit(tx, { actorType: "system", action: "catalogue.product_catalog_only", entityType: "product", entityId: p.id,
          before: { status: "draft" }, after: { ...source, status: "catalog_only", imageSha256: selection.find(row => row.slug === p.slug)!.imageSha256 } });
      }
      return plan;
    },
    { timeout: 300_000, isolationLevel: "Serializable" }
  );
}
