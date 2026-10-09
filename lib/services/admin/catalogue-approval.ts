import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import batchesFile from "@/lib/catalog/approval-batches.json";

/**
 * Owner identity + photo approval, one product per decision.
 *
 * The public boundary (lib/catalog-policy.ts) shows a product only after a
 * recorded identity confirmation and an explicitly approved primary photo. This
 * is the only path that writes those fields for real products:
 *
 *  - the approver is the signed-in admin passed in by the action — never a
 *    value from a form or file, so nothing can impersonate the owner;
 *  - the decision is checked against what the screen showed: the primary
 *    image's sha256 and the product's updatedAt. Any change since rendering
 *    (a URL switch, an edit) refuses the write — conflict protection;
 *  - P0/P1 can never be approved (the database CHECK also enforces evidence);
 *  - one transaction, rows locked, one audit row per decision.
 *
 * It does not touch commercial review (prices, tax, stock): that is a separate
 * owner decision and stays on the publication gate.
 */

export const APPROVAL_BATCHES: Record<string, string[]> = (batchesFile as { batches: Record<string, string[]> }).batches;

/** Titles that name a set, kit, pack or battery need an explicit pack/accessory decision. */
export const PACK_SENSITIVE = /\b(set|kit|pcs|pc|pack|combo|battery|batteries|cordless|charger|with)\b/i;

export type ImageDecision = "APPROVED_EXACT" | "APPROVED_WITH_LIMITATION" | "REJECTED";

export interface ApprovalInput {
  productId: string;
  imageId: string;
  /** What the screen showed — refused if either differs at write time. */
  expectedImageSha256: string;
  expectedProductUpdatedAt: string;
  identity: "CONFIRMED" | "REJECTED";
  image: ImageDecision;
  /** Only with APPROVED_WITH_LIMITATION. */
  severity?: "P2" | "P3" | null;
  packDecision?: string | null;
  evidence: string;
  limitations?: string | null;
}

export type ApprovalResult =
  | { ok: true; public: boolean }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "VALIDATION"; message: string };

function reasonText(i: ApprovalInput): string {
  return [
    `Identity: ${i.identity === "CONFIRMED" ? "confirmed exact model" : "rejected"}`,
    `Image: ${i.image}${i.severity ? ` (${i.severity})` : ""}`,
    i.packDecision?.trim() ? `Pack/accessories: ${i.packDecision.trim()}` : null,
    `Evidence: ${i.evidence.trim()}`,
    i.limitations?.trim() ? `Limitations: ${i.limitations.trim()}` : null,
  ].filter(Boolean).join(" | ");
}

export function validateApprovalInput(i: ApprovalInput, title: string): string | null {
  if (!i.evidence?.trim() || i.evidence.trim().length < 5) return "Record the evidence for this decision";
  if (i.image === "APPROVED_WITH_LIMITATION" && !(i.severity === "P2" || i.severity === "P3")) {
    return "A limitation must be P2 or P3 (P0/P1 cannot be approved)";
  }
  if (i.image === "APPROVED_WITH_LIMITATION" && !i.limitations?.trim()) return "Describe the limitation";
  if (i.image !== "APPROVED_WITH_LIMITATION" && i.severity) return "Severity applies only to an approval with limitation";
  if (PACK_SENSITIVE.test(title) && i.identity === "CONFIRMED" && !i.packDecision?.trim()) {
    return "This title names a set, kit, pack or battery — record the pack/accessory decision";
  }
  return null;
}

export async function recordCatalogueApproval(adminUserId: string, input: ApprovalInput): Promise<ApprovalResult> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; title: string; updated_at: Date }[]>`
      SELECT id, title, updated_at FROM products WHERE id = ${input.productId}::uuid FOR UPDATE`;
    const product = rows[0];
    if (!product) return { ok: false as const, code: "NOT_FOUND" as const, message: "Product not found" };
    const imgRows = await tx.$queryRaw<{ id: string; sha256: string | null; is_primary: boolean; product_id: string; url: string }[]>`
      SELECT id, sha256, is_primary, product_id, url FROM product_images WHERE id = ${input.imageId}::uuid FOR UPDATE`;
    const image = imgRows[0];
    if (!image || image.product_id !== product.id) return { ok: false as const, code: "NOT_FOUND" as const, message: "Image not found for this product" };
    if (!image.is_primary) return { ok: false as const, code: "VALIDATION" as const, message: "Only the primary image can carry the listing approval" };
    if (!image.sha256 || image.sha256 !== input.expectedImageSha256) {
      return { ok: false as const, code: "CONFLICT" as const, message: "The image changed since this screen loaded — reload and review it again" };
    }
    if (new Date(input.expectedProductUpdatedAt).getTime() !== product.updated_at.getTime()) {
      return { ok: false as const, code: "CONFLICT" as const, message: "The product changed since this screen loaded — reload and review it again" };
    }
    const problem = validateApprovalInput(input, product.title);
    if (problem) return { ok: false as const, code: "VALIDATION" as const, message: problem };

    const now = new Date();
    const reason = reasonText(input);
    const before = await tx.productImage.findUniqueOrThrow({
      where: { id: image.id },
      select: { approvalStatus: true, identityApproved: true, severity: true, approvedBy: true },
    });
    const beforeProduct = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { identityConfirmed: true, identityApprovedBy: true } });

    const identityOk = input.identity === "CONFIRMED";
    await tx.product.update({
      where: { id: product.id },
      data: identityOk
        ? { identityConfirmed: true, identityApprovedAt: now, identityApprovedBy: adminUserId, identityApprovalReason: reason }
        : { identityConfirmed: false, identityApprovedAt: null, identityApprovedBy: null, identityApprovalReason: null },
    });
    const imageOk = input.image !== "REJECTED";
    await tx.productImage.update({
      where: { id: image.id },
      data: imageOk && identityOk
        ? {
            sourceVerified: true, identityApproved: true, approvalStatus: input.image,
            severity: input.image === "APPROVED_WITH_LIMITATION" ? input.severity : null,
            approvedAt: now, approvedBy: adminUserId, approvalReason: reason,
          }
        : {
            identityApproved: false, approvalStatus: imageOk ? "REVIEW_REQUIRED" : "REJECTED",
            severity: null, approvedAt: imageOk ? null : now, approvedBy: imageOk ? null : adminUserId,
            approvalReason: imageOk ? null : reason,
          },
    });
    await recordAudit(tx, {
      actorType: "admin",
      actorId: adminUserId,
      action: "catalogue.approval_recorded",
      entityType: "product",
      entityId: product.id,
      before: { identityConfirmed: beforeProduct.identityConfirmed, image: { id: image.id, ...before } },
      after: {
        identity: input.identity, image: { id: image.id, sha256: image.sha256, url: image.url, decision: input.image, severity: input.severity ?? null },
        reason,
      },
    });
    return { ok: true as const, public: identityOk && imageOk };
  });
}

/** Everything the review screen needs for one batch, read fresh. */
export async function approvalBatchView(batch: string) {
  const slugs = APPROVAL_BATCHES[batch] ?? [];
  const products = await db.product.findMany({
    where: { slug: { in: slugs } },
    select: {
      id: true, slug: true, title: true, status: true, specs: true, updatedAt: true,
      identityConfirmed: true, identityApprovedAt: true, identityApprovalReason: true,
      brand: { select: { name: true, isActive: true } },
      category: { select: { name: true, isActive: true } },
      images: {
        orderBy: [{ isPrimary: "desc" }],
        select: { id: true, url: true, sha256: true, isPrimary: true, sourceUrl: true, licence: true, approvalStatus: true, severity: true, approvalReason: true },
      },
    },
  });
  const order = new Map(slugs.map((s, i) => [s, i]));
  return products.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
}
