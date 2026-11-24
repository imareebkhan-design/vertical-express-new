import "server-only";
import { db } from "@/lib/db";
import { recordAudit, type DbClient } from "@/lib/services/audit";

type Actor = { id: string; email: string };
type BrandState = { id: string; name: string; slug: string; isActive: boolean };

/** Lock before reading the preimage, including for no-op decisions. A transaction
 * alone would still let two readers audit the same stale state. */
export async function editBrand(originalSlug: string, data: Omit<BrandState, "id">, actor: Actor) {
  return db.$transaction(async (tx) => {
    const [before] = await tx.$queryRaw<BrandState[]>`
      SELECT id, name, slug, is_active AS "isActive"
      FROM brands WHERE slug = ${originalSlug} FOR UPDATE`;
    if (!before) return null;
    await tx.brand.update({ where: { id: before.id }, data });
    await recordAudit(tx, {
      actorType: "admin", actorId: actor.id, action: "brand.edited",
      entityType: "brand", entityId: before.id,
      before: { name: before.name, slug: before.slug, isActive: before.isActive },
      after: data,
    });
    return before;
  });
}

/** Retire or restore under the same row lock used by edits, without auditing a no-op. */
export async function setBrandActive(slug: string, isActive: boolean, actor: Actor) {
  return db.$transaction((tx) => setBrandActiveTx(tx, slug, isActive, actor));
}

/**
 * The same switch inside a caller's transaction (Launch Control batches). Same
 * lock, no-op skip and audit; `audit` adds fields (a batch id) to `after`.
 */
export async function setBrandActiveTx(
  tx: DbClient,
  slug: string,
  isActive: boolean,
  actor: { id: string | null; email: string },
  audit: Record<string, string> = {},
): Promise<"missing" | "unchanged" | "changed"> {
  const [before] = await tx.$queryRaw<BrandState[]>`
    SELECT id, name, slug, is_active AS "isActive"
    FROM brands WHERE slug = ${slug} FOR UPDATE`;
  if (!before) return "missing";
  if (before.isActive === isActive) return "unchanged";
  await tx.brand.update({ where: { id: before.id }, data: { isActive } });
  await recordAudit(tx, {
    actorType: "admin", actorId: actor.id,
    action: isActive ? "brand.restored" : "brand.retired",
    entityType: "brand", entityId: before.id,
    before: { isActive: before.isActive }, after: { ...audit, isActive },
  });
  return "changed";
}

/** Serialize assignments and keep the target brand name stable through the audit write. */
export async function assignProductBrand(productId: string, brandId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const [product] = await tx.$queryRaw<{ id: string; brandId: string }[]>`
      SELECT id, brand_id AS "brandId" FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    if (!product) return { ok: false as const, detail: "Product not found" };
    // Keep the name used in the audit stable until the assignment commits.
    const [brand] = await tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM brands WHERE id = ${brandId}::uuid FOR SHARE`;
    if (!brand) return { ok: false as const, detail: "Brand not found" };
    if (product.brandId === brandId) return { ok: true as const, changed: false as const };
    await tx.product.update({ where: { id: productId }, data: { brandId } });
    await recordAudit(tx, {
      actorType: "admin", actorId: actor.id, action: "product.brand_assigned",
      entityType: "product", entityId: productId,
      before: { brandId: product.brandId }, after: { brandId, brandName: brand.name },
    });
    return { ok: true as const, changed: true as const, product, brand };
  });
}

export type CreateBrandResult =
  | { ok: true; brand: { id: string; name: string; slug: string; isActive: boolean } }
  | { ok: false; code: "TAKEN" };

/**
 * Insert a brand and audit it in one transaction. The single create path for the
 * Brands page and for "+ New brand" on the product form, so both refuse a
 * duplicate the same way: the unique constraint on name and slug, never an upsert
 * (an upsert keyed on slug silently renamed an existing brand; see actions/brands.ts).
 */
export async function createBrand(
  data: { name: string; slug: string; isActive: boolean },
  actor: Actor,
  source: "brands_page" | "product_form" = "brands_page"
): Promise<CreateBrandResult> {
  try {
    const brand = await db.$transaction(async (tx) => {
      const created = await tx.brand.create({
        data,
        select: { id: true, name: true, slug: true, isActive: true },
      });
      await recordAudit(tx, {
        actorType: "admin",
        actorId: actor.id,
        action: "brand.created",
        entityType: "brand",
        entityId: created.id,
        after: { ...data, source },
      });
      return created;
    });
    return { ok: true, brand };
  } catch (error) {
    const e = error as { code?: string; meta?: { modelName?: string } };
    if (e?.code === "P2002") return { ok: false, code: "TAKEN" };
    throw error;
  }
}
