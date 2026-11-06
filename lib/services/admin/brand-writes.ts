import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";

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
  return db.$transaction(async (tx) => {
    const [before] = await tx.$queryRaw<BrandState[]>`
      SELECT id, name, slug, is_active AS "isActive"
      FROM brands WHERE slug = ${slug} FOR UPDATE`;
    if (!before) return "missing" as const;
    if (before.isActive === isActive) return "unchanged" as const;
    await tx.brand.update({ where: { id: before.id }, data: { isActive } });
    await recordAudit(tx, {
      actorType: "admin", actorId: actor.id,
      action: isActive ? "brand.restored" : "brand.retired",
      entityType: "brand", entityId: before.id,
      before: { isActive: before.isActive }, after: { isActive },
    });
    return "changed" as const;
  });
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
