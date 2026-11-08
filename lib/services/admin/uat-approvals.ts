import "server-only";
import { Prisma } from "@/prisma/generated/client/client";
import { recordAudit } from "@/lib/services/audit";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { sellableReasons } from "@/lib/services/admin/publish-guard";
import { isQaFixtureSlug } from "@/lib/catalog/qa-fixture-ids";

/**
 * CLIENT UAT ONLY — makes the staging products that carry a stored MRP buyable
 * for acceptance testing (owner, 8 Nov 2026: "Use stored MRP, test-only").
 *
 * For each eligible product, in this order (the invalidation triggers clear an
 * approval whenever price, photo or identity fields change, so approvals are
 * written last):
 *   1. every active variant's selling price := its stored MRP (no discount);
 *   2. the primary photo gets its file's sha256 and the `uat-test-only` licence,
 *      then a test approval;
 *   3. identity and commercial review are recorded by UAT_APPROVER, with the
 *      category's existing checkout tax mapping (no rate is invented here).
 * Then the product must pass the ordinary publish gate, or the transaction aborts.
 *
 * What stops this reaching production: the caller refuses any database but
 * staging or a disposable local one, and production listings also require an
 * attested photo licence (`ATTESTED_IMAGE_LICENCES`), which `uat-test-only` is not.
 *
 * Products without an MRP on every active variant, or in a category with no tax
 * mapping, or without a primary photo, are reported and left untouched.
 * A per-product audit marker holding the full prior state makes reruns no-ops
 * and lets `revertUatTestApprovals` restore it.
 */
export const UAT_APPROVAL_ACTION = "uat.test_approval_applied";
export const UAT_APPROVAL_REVERT_ACTION = "uat.test_approval_reverted";
export const UAT_APPROVER = "client-uat (TEST ONLY — not an owner approval)";
export const UAT_IMAGE_LICENCE = "uat-test-only";
const REASON = "CLIENT UAT ONLY: stored seed MRP used as the test price; not a verified MRP, identity, photo or tax review";
const LOCK = 746502609;

export interface UatApprovalResult {
  approved: string[];
  alreadyApproved: string[];
  missingMrp: string[];
  noTaxMapping: string[];
  noPrimaryImage: string[];
}

interface PriorState {
  deliverySpeed: string | null;
  identityConfirmed: boolean;
  identityApprovedAt: string | null;
  identityApprovedBy: string | null;
  identityApprovalReason: string | null;
  commercialReview: Prisma.JsonValue | null;
  variants: { id: string; sku: string; pricePaise: number; compareAtPaise: number | null }[];
  image: {
    id: string; sha256: string | null; licence: string | null; sourceVerified: boolean; identityApproved: boolean;
    approvalStatus: string; severity: string | null; approvedAt: string | null; approvedBy: string | null; approvalReason: string | null;
  };
}

/** Caller guards the target and supplies the transaction. `sha256Of` hashes a stored image URL's bytes. */
export async function prepareUatTestApprovals(
  tx: Prisma.TransactionClient,
  sha256Of: (url: string) => Promise<string>,
): Promise<UatApprovalResult> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
  const result: UatApprovalResult = { approved: [], alreadyApproved: [], missingMrp: [], noTaxMapping: [], noPrimaryImage: [] };
  const products = await tx.product.findMany({
    where: { status: { in: ["published", "catalog_only"] }, brand: { isActive: true }, category: { isActive: true } },
    include: {
      category: { select: { slug: true, isBulk: true } },
      variants: { where: { isActive: true }, orderBy: { sku: "asc" } },
      images: { where: { isPrimary: true } },
    },
    orderBy: { slug: "asc" },
  });

  for (const p of products) {
    if (isQaFixtureSlug(p.slug) || p.variants.length === 0) continue;
    const marker = await tx.auditLog.findFirst({
      where: { action: UAT_APPROVAL_ACTION, entityType: "product", entityId: p.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
    });
    const reverted = marker && await tx.auditLog.findFirst({
      where: { action: UAT_APPROVAL_REVERT_ACTION, entityType: "product", entityId: p.id, createdAt: { gt: marker.createdAt } }, select: { id: true },
    });
    if (marker && !reverted) { result.alreadyApproved.push(p.slug); continue; }
    if (p.variants.some(v => v.compareAtPaise == null || v.compareAtPaise <= 0)) { result.missingMrp.push(p.slug); continue; }
    const tax = CATEGORY_TAX_CONFIGS[p.category.slug];
    if (!tax) { result.noTaxMapping.push(p.slug); continue; }
    const image = p.images[0];
    if (!image) { result.noPrimaryImage.push(p.slug); continue; }

    const prior: PriorState = {
      deliverySpeed: p.deliverySpeed,
      identityConfirmed: p.identityConfirmed,
      identityApprovedAt: p.identityApprovedAt?.toISOString() ?? null,
      identityApprovedBy: p.identityApprovedBy,
      identityApprovalReason: p.identityApprovalReason,
      commercialReview: p.commercialReview ?? null,
      variants: p.variants.map(v => ({ id: v.id, sku: v.sku, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise })),
      image: {
        id: image.id, sha256: image.sha256, licence: image.licence, sourceVerified: image.sourceVerified,
        identityApproved: image.identityApproved, approvalStatus: image.approvalStatus, severity: image.severity,
        approvedAt: image.approvedAt?.toISOString() ?? null, approvedBy: image.approvedBy, approvalReason: image.approvalReason,
      },
    };

    // 1. Price = stored MRP. Trigger clears any commercial review; it is rewritten in step 3.
    for (const v of p.variants) {
      await tx.productVariant.update({ where: { id: v.id }, data: { pricePaise: v.compareAtPaise! } });
    }
    const deliverySpeed = p.deliverySpeed ?? (p.category.isBulk ? "scheduled" : "express");
    if (deliverySpeed !== p.deliverySpeed) await tx.product.update({ where: { id: p.id }, data: { deliverySpeed } });

    // 2. Photo: provenance fields first (resets approval via trigger), then the test approval.
    const now = new Date();
    await tx.productImage.update({ where: { id: image.id }, data: { sha256: await sha256Of(image.url), licence: UAT_IMAGE_LICENCE } });
    await tx.productImage.update({
      where: { id: image.id },
      data: {
        sourceVerified: true, identityApproved: true, approvalStatus: "APPROVED_EXACT", severity: null,
        approvedAt: now, approvedBy: UAT_APPROVER, approvalReason: REASON,
      },
    });

    // 3. Identity and commercial review, matching the variants exactly as they now are.
    const variants = await tx.productVariant.findMany({ where: { productId: p.id, isActive: true }, orderBy: { sku: "asc" } });
    await tx.product.update({
      where: { id: p.id },
      data: {
        identityConfirmed: true, identityApprovedAt: now, identityApprovedBy: UAT_APPROVER, identityApprovalReason: REASON,
        commercialReview: {
          approvedBy: UAT_APPROVER, approvedAt: now.toISOString(), reason: REASON,
          unitLabel: p.unitLabel, deliverySpeed, hsn: tax.hsn, gstRatePct: tax.ratePct, inventoryMode: "tracked",
          variants: variants.map(v => ({ sku: v.sku, pack: v.name, name: v.name, isDefault: v.isDefault, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise })),
        },
      },
    });

    const reasons = await sellableReasons(tx, p.id);
    if (reasons.length) throw new Error(`${p.slug} is still not sellable after test approval: ${reasons.join("; ")}`);
    if (p.status !== "published") await tx.product.update({ where: { id: p.id }, data: { status: "published" } });

    await recordAudit(tx, {
      actorType: "system", action: UAT_APPROVAL_ACTION, entityType: "product", entityId: p.id,
      before: { ...prior, status: p.status } as unknown as Prisma.InputJsonValue,
      after: {
        testOnly: true, approver: UAT_APPROVER, imageLicence: UAT_IMAGE_LICENCE,
        prices: variants.map(v => ({ sku: v.sku, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise })),
        authorization: "Owner, 8 Nov 2026: use stored MRP for client UAT, test-only",
      },
    });
    result.approved.push(p.slug);
  }
  return result;
}

/** Restores every product this initializer changed to its recorded prior state. */
export async function revertUatTestApprovals(tx: Prisma.TransactionClient): Promise<string[]> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
  const markers = await tx.auditLog.findMany({ where: { action: UAT_APPROVAL_ACTION, entityType: "product" }, orderBy: { createdAt: "asc" } });
  const latest = new Map(markers.map(m => [m.entityId, m]));
  const reverted: string[] = [];
  for (const [productId, marker] of latest) {
    if (!productId) continue;
    const undone = await tx.auditLog.findFirst({
      where: { action: UAT_APPROVAL_REVERT_ACTION, entityType: "product", entityId: productId, createdAt: { gt: marker.createdAt } }, select: { id: true },
    });
    if (undone) continue;
    const prior = marker.before as unknown as PriorState & { status: "draft" | "published" | "catalog_only" | "archived" };
    for (const v of prior.variants) await tx.productVariant.update({ where: { id: v.id }, data: { pricePaise: v.pricePaise } });
    // Provenance first (the trigger resets approval), then the prior approval fields verbatim.
    await tx.productImage.update({ where: { id: prior.image.id }, data: { sha256: prior.image.sha256, licence: prior.image.licence } });
    await tx.productImage.update({
      where: { id: prior.image.id },
      data: {
        sourceVerified: prior.image.sourceVerified, identityApproved: prior.image.identityApproved,
        approvalStatus: prior.image.approvalStatus as "REVIEW_REQUIRED", severity: prior.image.severity as null,
        approvedAt: prior.image.approvedAt ? new Date(prior.image.approvedAt) : null,
        approvedBy: prior.image.approvedBy, approvalReason: prior.image.approvalReason,
      },
    });
    await tx.product.update({ where: { id: productId }, data: { deliverySpeed: prior.deliverySpeed as "express" | "scheduled" | null } });
    const product = await tx.product.update({
      where: { id: productId },
      data: {
        status: prior.status,
        identityConfirmed: prior.identityConfirmed,
        identityApprovedAt: prior.identityApprovedAt ? new Date(prior.identityApprovedAt) : null,
        identityApprovedBy: prior.identityApprovedBy, identityApprovalReason: prior.identityApprovalReason,
        commercialReview: prior.commercialReview == null ? Prisma.DbNull : (prior.commercialReview as Prisma.InputJsonValue),
      },
      select: { slug: true },
    });
    await recordAudit(tx, {
      actorType: "system", action: UAT_APPROVAL_REVERT_ACTION, entityType: "product", entityId: productId,
      before: { testOnly: true }, after: { restoredFrom: marker.id },
    });
    reverted.push(product.slug);
  }
  return reverted;
}
