import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";

/**
 * Importing the owner's master catalogue as draft product ranges.
 *
 * The 1 Oct 2026 catalogue names brands and product families, not things a
 * customer can buy: no SKU, no price, no stock. The schema's sellable unit is a
 * priced variant, so a range goes in as a draft Product with no variants, and
 * stays unpublishable until real variants are added (see publish-guard.ts).
 *
 * What this will and will not do:
 *  - creates categories and brands that do not exist yet, INACTIVE, because the
 *    storefront lists active categories and suggests active brands whether or not
 *    they have anything published behind them;
 *  - creates each range as status "draft", which every storefront query excludes;
 *  - never creates a variant, a price, stock or an image;
 *  - never modifies an existing category, brand or product. A slug that already
 *    exists with the same brand and category is reused; with anything else it is a
 *    conflict, and a plan with conflicts writes nothing;
 *  - records provenance (source rows, original ranges, declared options) in the
 *    audit log, not in `specs`, which the product page would show if published.
 *
 * Rerunning is safe: everything is keyed by slug, so a second run reuses all of it.
 */

const GROUPS = ["civil_interiors", "furniture_hardware", "electrical", "plumbing_bath", "tools", "other"] as const;
const slug = z.string().regex(/^[a-z0-9-]{2,160}$/);

const family = z.object({
  slug,
  title: z.string().trim().min(3).max(160),
  brand: z.string().trim().min(1),
  series: z.string().nullable(),
  category: slug,
  productType: z.string(),
  sourceRows: z.array(z.number().int()).min(1),
  originalRanges: z.array(z.string()),
  declaredOptions: z.array(z.string()),
  sourceTypes: z.array(z.string().nullable()),
  dbVariants: z.literal(0),
  price: z.null(),
  stock: z.null(),
});

export const rangeCatalogueSchema = z.object({
  version: z.string(),
  sourceId: z.string(),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  taxonomy: z.object({
    categories: z.array(z.object({ slug, name: z.string().min(2), group: z.enum(GROUPS) })),
  }),
  brands: z.array(z.object({ display: z.string().trim().min(1), slug })),
  families: z.array(family),
});

export type RangeCatalogue = z.infer<typeof rangeCatalogueSchema>;
type Family = RangeCatalogue["families"][number];

export interface RangeImportPlan {
  categories: { create: RangeCatalogue["taxonomy"]["categories"]; reuse: string[] };
  brands: { create: RangeCatalogue["brands"]; reuse: string[] };
  products: { create: Family[]; reuse: string[] };
  conflicts: { slug: string; reason: string }[];
}

export interface RangeImportResult {
  plan: RangeImportPlan;
  created: { categories: number; brands: number; products: number };
}

/** What an import would do against the database it is pointed at. Writes nothing. */
export async function planRangeImport(input: RangeCatalogue): Promise<RangeImportPlan> {
  const cat = rangeCatalogueSchema.parse(input);
  const conflicts: RangeImportPlan["conflicts"] = [];

  const existingCats = new Set((await db.category.findMany({ select: { slug: true } })).map((c) => c.slug));
  const categories = { create: cat.taxonomy.categories.filter((c) => !existingCats.has(c.slug)), reuse: [] as string[] };
  categories.reuse = cat.taxonomy.categories.filter((c) => existingCats.has(c.slug)).map((c) => c.slug);

  /* Brand names are unique in the table but case-sensitive there; matching here
     is case-insensitive so "Havells" can never be created beside "HAVELLS". */
  const existingBrands = await db.brand.findMany({ select: { slug: true, name: true } });
  const brandHit = (b: { display: string; slug: string }) =>
    existingBrands.find((e) => e.slug === b.slug || e.name.toLowerCase() === b.display.toLowerCase());
  const brands = { create: cat.brands.filter((b) => !brandHit(b)), reuse: cat.brands.filter((b) => brandHit(b)).map((b) => b.slug) };

  const known = new Set(cat.taxonomy.categories.map((c) => c.slug));
  const brandSlugOf = new Map(cat.brands.map((b) => [b.display, brandHit(b)?.slug ?? b.slug]));
  for (const f of cat.families) {
    if (!known.has(f.category)) conflicts.push({ slug: f.slug, reason: `category ${f.category} is not in the catalogue's taxonomy` });
    if (!brandSlugOf.has(f.brand)) conflicts.push({ slug: f.slug, reason: `brand ${f.brand} is not in the catalogue's brand table` });
  }

  const existingProducts = await db.product.findMany({
    where: { slug: { in: cat.families.map((f) => f.slug) } },
    select: { slug: true, status: true, brand: { select: { slug: true } }, category: { select: { slug: true } }, _count: { select: { variants: true } } },
  });
  const bySlug = new Map(existingProducts.map((p) => [p.slug, p]));
  const products = { create: [] as Family[], reuse: [] as string[] };
  for (const f of cat.families) {
    const p = bySlug.get(f.slug);
    if (!p) products.create.push(f);
    else if (p.brand.slug === brandSlugOf.get(f.brand) && p.category.slug === f.category) products.reuse.push(f.slug);
    else conflicts.push({ slug: f.slug, reason: "a product with this slug already exists with a different brand or category" });
  }
  return { categories, brands, products, conflicts };
}

/**
 * Apply the plan. Taxonomy and brands go in one transaction, then each category's
 * ranges in its own, so a failure is traceable to a category and a rerun resumes.
 */
export async function applyRangeImport(input: RangeCatalogue, artifactSha256: string): Promise<RangeImportResult> {
  const cat = rangeCatalogueSchema.parse(input);
  const plan = await planRangeImport(cat);
  if (plan.conflicts.length) {
    throw new Error(`Catalogue import refused: ${plan.conflicts.length} conflict(s); nothing was written`);
  }
  const source = { sourceId: cat.sourceId, version: cat.version, sourceSha256: cat.sourceSha256, artifactSha256 };

  await db.$transaction(
    async (tx) => {
      for (const c of plan.categories.create) {
        const row = await tx.category.create({ data: { slug: c.slug, name: c.name, group: c.group, isActive: false } });
        await recordAudit(tx, { actorType: "system", action: "catalogue.category_created", entityType: "category", entityId: row.id,
          after: { slug: c.slug, name: c.name, group: c.group, isActive: false, source } });
      }
      for (const b of plan.brands.create) {
        const row = await tx.brand.create({ data: { slug: b.slug, name: b.display, isActive: false } });
        await recordAudit(tx, { actorType: "system", action: "catalogue.brand_created", entityType: "brand", entityId: row.id,
          after: { slug: b.slug, name: b.display, isActive: false, source } });
      }
    },
    { timeout: 120_000 }
  );

  const catId = new Map((await db.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const allBrands = await db.brand.findMany({ select: { id: true, slug: true, name: true } });
  const brandId = (display: string) => {
    const b = cat.brands.find((x) => x.display === display)!;
    return allBrands.find((e) => e.slug === b.slug || e.name.toLowerCase() === b.display.toLowerCase())!.id;
  };

  const byCategory = new Map<string, Family[]>();
  for (const f of plan.products.create) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);
  let products = 0;
  for (const [category, fams] of [...byCategory].sort(([a], [b]) => a.localeCompare(b))) {
    await db.$transaction(
      async (tx) => {
        for (const f of fams) {
          const row = await tx.product.create({
            data: { slug: f.slug, title: f.title, brandId: brandId(f.brand), categoryId: catId.get(category)!, status: "draft" },
          });
          await recordAudit(tx, { actorType: "system", action: "catalogue.range_imported", entityType: "product", entityId: row.id,
            after: { slug: f.slug, status: "draft", series: f.series, productType: f.productType, sourceRows: f.sourceRows,
              originalRanges: f.originalRanges, declaredOptions: f.declaredOptions, sourceTypes: f.sourceTypes, source } });
        }
      },
      { timeout: 120_000 }
    );
    products += fams.length;
  }
  return { plan, created: { categories: plan.categories.create.length, brands: plan.brands.create.length, products } };
}
