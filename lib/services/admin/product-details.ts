import "server-only";
import { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { priceProblem } from "@/lib/services/admin/variant-pricing";
import { MAX_SPEC_ROWS, specRows, type SpecRow } from "@/lib/catalog/specs";

/**
 * A product's description, unit and specifications, and its variants, from the
 * console (handover, 19 Oct 2026).
 *
 * The database decides what an edit costs, not this file:
 *   - unit label and specifications are part of a product's identity; changing
 *     either clears the identity approval and the commercial review (triggers
 *     `invalidate_catalogue_identity_review`, `invalidate_catalogue_commercial_review`),
 *     so the product leaves the shop until it is approved again. The result says
 *     so, and the screen warns before saving;
 *   - the description is copy, not identity: editing it clears nothing;
 *   - adding, retiring or re-defaulting a variant clears the commercial review
 *     (`invalidate_variant_*`), so a changed offer is never sold on an old review.
 * Every change is audited in its own transaction.
 */

export const MAX_DESCRIPTION = 4000;

export interface ProductDetailsInput {
  description: string;
  unitLabel: string;
  specs: SpecRow[];
}

export type DetailsResult =
  | { ok: true; identityReset: boolean; commercialReset: boolean }
  | { ok: false; code: "NOT_FOUND" | "INVALID"; detail?: string };

function cleanSpecs(rows: SpecRow[]): SpecRow[] {
  return specRows(rows).filter((r) => r.value !== "");
}

export async function saveProductDetails(
  productId: string,
  input: ProductDetailsInput,
  actor: { id: string | null; email: string }
): Promise<DetailsResult> {
  const unitLabel = input.unitLabel.trim();
  if (!unitLabel || unitLabel.length > 40) return { ok: false, code: "INVALID", detail: "The unit needs 1–40 characters, e.g. 'per bag'" };
  if (input.description.length > MAX_DESCRIPTION) return { ok: false, code: "INVALID", detail: "The description is too long" };
  const specs = cleanSpecs(input.specs);
  if (specs.length > MAX_SPEC_ROWS) return { ok: false, code: "INVALID", detail: `At most ${MAX_SPEC_ROWS} specification rows` };
  if (specs.some((s) => s.label.length > 60 || s.value.length > 200)) {
    return { ok: false, code: "INVALID", detail: "A specification is too long" };
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    const before = await tx.product.findUnique({
      where: { id: productId },
      select: { description: true, unitLabel: true, specs: true, identityConfirmed: true, commercialReview: true },
    });
    if (!before) return { ok: false as const, code: "NOT_FOUND" as const };
    const description = input.description.trim() || null;
    const after = await tx.product.update({
      where: { id: productId },
      data: { description, unitLabel, specs: specs.length ? (specs as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
      select: { identityConfirmed: true, commercialReview: true },
    });
    const identityReset = before.identityConfirmed && !after.identityConfirmed;
    const commercialReset = before.commercialReview !== null && after.commercialReview === null;
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "catalogue.product_details_edited",
      entityType: "product",
      entityId: productId,
      before: { description: before.description, unitLabel: before.unitLabel, specs: specRows(before.specs) as unknown as Prisma.InputJsonValue },
      after: { description, unitLabel, specs: specs as unknown as Prisma.InputJsonValue, identityReset, commercialReset, by: actor.email },
    });
    return { ok: true as const, identityReset, commercialReset };
  });
}

export interface NewVariantInput {
  name: string;
  sku: string;
  pricePaise: number;
  compareAtPaise: number | null;
  /** A stock row at zero in this warehouse, so stock can be counted in later. Optional. */
  warehouseId: string | null;
}

export type VariantResult =
  | { ok: true; variantId: string }
  | { ok: false; code: "NOT_FOUND" | "INVALID" | "SKU_TAKEN" | "IS_DEFAULT" | "INACTIVE"; detail?: string };

export async function addVariant(productId: string, input: NewVariantInput, actor: { id: string | null; email: string }): Promise<VariantResult> {
  const name = input.name.trim();
  const sku = input.sku.trim();
  if (!name || name.length > 80) return { ok: false, code: "INVALID", detail: "A variant needs a name, e.g. '50 kg bag'" };
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{1,63}$/.test(sku)) return { ok: false, code: "INVALID", detail: "The SKU may use letters, numbers and . _ - / only" };
  const problem = priceProblem(input.pricePaise, input.compareAtPaise);
  if (problem) return { ok: false, code: "INVALID", detail: problem };

  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { variants: { where: { isActive: true, isDefault: true }, select: { id: true } } },
      });
      if (!product) return { ok: false as const, code: "NOT_FOUND" as const };
      if (input.warehouseId) {
        const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId, isActive: true }, select: { id: true } });
        if (!wh) return { ok: false as const, code: "INVALID" as const, detail: "That warehouse is not active" };
      }
      const variant = await tx.productVariant.create({
        data: {
          productId,
          name,
          sku,
          pricePaise: input.pricePaise,
          compareAtPaise: input.compareAtPaise,
          isActive: true,
          // The first active variant leads; otherwise the existing default keeps leading.
          isDefault: product.variants.length === 0,
          ...(input.warehouseId ? { inventory: { create: { warehouseId: input.warehouseId, qtyOnHand: 0 } } } : {}),
        },
        select: { id: true, isDefault: true },
      });
      await recordAudit(tx, {
        actorType: "admin",
        actorId: actor.id,
        action: "catalogue.variant_added",
        entityType: "product",
        entityId: productId,
        after: { variantId: variant.id, name, sku, pricePaise: input.pricePaise, compareAtPaise: input.compareAtPaise, isDefault: variant.isDefault, by: actor.email },
      });
      return { ok: true as const, variantId: variant.id };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, code: "SKU_TAKEN" };
    throw e;
  }
}

/**
 * Retire or restore a variant. The default variant cannot be retired: make
 * another one the default first, so a product is never left leading with an
 * offer nobody can buy. Carts drop retired variants on their next read.
 */
export async function setVariantActive(variantId: string, active: boolean, actor: { id: string | null; email: string }): Promise<VariantResult> {
  return db.$transaction(async (tx) => {
    const v = await tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true, productId: true, isActive: true, isDefault: true } });
    if (!v) return { ok: false as const, code: "NOT_FOUND" as const };
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${v.productId}::uuid FOR UPDATE`;
    if (!active && v.isDefault) return { ok: false as const, code: "IS_DEFAULT" as const };
    if (v.isActive === active) return { ok: true as const, variantId };
    await tx.productVariant.update({ where: { id: variantId }, data: { isActive: active } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: active ? "catalogue.variant_restored" : "catalogue.variant_retired",
      entityType: "product",
      entityId: v.productId,
      after: { variantId, by: actor.email },
    });
    return { ok: true as const, variantId };
  });
}

/** Make an active variant the one the product leads with. Exactly one default afterwards. */
export async function setDefaultVariant(variantId: string, actor: { id: string | null; email: string }): Promise<VariantResult> {
  return db.$transaction(async (tx) => {
    const v = await tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true, productId: true, isActive: true, isDefault: true } });
    if (!v) return { ok: false as const, code: "NOT_FOUND" as const };
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${v.productId}::uuid FOR UPDATE`;
    if (!v.isActive) return { ok: false as const, code: "INACTIVE" as const };
    if (v.isDefault) return { ok: true as const, variantId };
    const before = await tx.productVariant.findFirst({ where: { productId: v.productId, isDefault: true }, select: { id: true } });
    await tx.productVariant.updateMany({ where: { productId: v.productId, isDefault: true }, data: { isDefault: false } });
    await tx.productVariant.update({ where: { id: variantId }, data: { isDefault: true } });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "catalogue.default_variant_changed",
      entityType: "product",
      entityId: v.productId,
      before: { defaultVariantId: before?.id ?? null },
      after: { defaultVariantId: variantId, by: actor.email },
    });
    return { ok: true as const, variantId };
  });
}
