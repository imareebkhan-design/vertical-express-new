import "server-only";
import type { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { recordAudit, type DbClient } from "@/lib/services/audit";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { priceProblem } from "@/lib/services/admin/variant-pricing";
import { commercialReviewSchema, validateCommercialReadiness } from "@/lib/services/admin/commercial-readiness";

/**
 * Recording a product's commercial review from the console.
 *
 * The database clears `products.commercial_review` whenever the offer changes
 * (a price, an MRP, a variant, the unit, the delivery class — migration
 * `20261009100000`), and a product without a matching review is not for sale
 * (`validateCommercialReadiness`). Until 13 Nov 2026 only the QA and UAT
 * scripts could write the review back, so every routine price change took a
 * product off sale until a developer ran a script.
 *
 * What this does, and what it refuses to do:
 *   - it records that a named operator reviewed the offer AS IT NOW STANDS —
 *     unit, delivery class, every active SKU's price and MRP, and the HSN and
 *     GST rate checkout will charge. Nothing is entered here: prices are set on
 *     the price controls, tax in `lib/services/tax.ts`;
 *   - the operator's screen sends back what it showed (`seen`). If the product
 *     has changed since, nothing is recorded — a review of a price nobody
 *     looked at is not a review;
 *   - a missing delivery class or tax mapping is refused, never defaulted;
 *   - it does not publish, approve identity or a photo, or touch stock. What
 *     still stops the product selling is returned so the screen can say so.
 * Who may review is not decided here: the console has one operator tier
 * (owner decision D4 pending). The reviewer and reason are audited.
 */

export const MIN_REVIEW_REASON = 10;

export interface ReviewedOffer {
  unitLabel: string;
  deliverySpeed: string | null;
  hsn: string | null;
  gstRatePct: number | null;
  variants: { sku: string; name: string; isDefault: boolean; pricePaise: number; compareAtPaise: number | null }[];
}

export type RecordReviewResult =
  | { ok: true; remaining: string[] }
  | { ok: false; code: "NOT_FOUND" | "REASON_REQUIRED" | "STALE" | "NOT_REVIEWABLE"; detail?: string };

/** The offer a review covers, exactly as stored. Shown to the operator and compared on submit. */
export async function currentOffer(client: DbClient, productId: string): Promise<ReviewedOffer | null> {
  const p = await client.product.findUnique({
    where: { id: productId },
    select: {
      unitLabel: true,
      deliverySpeed: true,
      category: { select: { slug: true } },
      variants: {
        where: { isActive: true },
        orderBy: { sku: "asc" },
        select: { sku: true, name: true, isDefault: true, pricePaise: true, compareAtPaise: true },
      },
    },
  });
  if (!p) return null;
  const tax = CATEGORY_TAX_CONFIGS[p.category.slug];
  return { unitLabel: p.unitLabel, deliverySpeed: p.deliverySpeed, hsn: tax?.hsn ?? null, gstRatePct: tax?.ratePct ?? null, variants: p.variants };
}

/** Order-insensitive on SKUs; everything else exact. */
export function sameOffer(a: ReviewedOffer, b: ReviewedOffer): boolean {
  const norm = (o: ReviewedOffer) =>
    JSON.stringify([
      o.unitLabel, o.deliverySpeed, o.hsn, o.gstRatePct,
      [...o.variants].sort((x, y) => x.sku.localeCompare(y.sku)).map((v) => [v.sku, v.name, v.isDefault, v.pricePaise, v.compareAtPaise]),
    ]);
  return norm(a) === norm(b);
}

export async function recordCommercialReview(params: {
  productId: string;
  actor: { id: string | null; email: string };
  reason: string;
  /** What the operator's screen showed when they pressed the button. */
  seen: ReviewedOffer;
}): Promise<RecordReviewResult> {
  const reason = params.reason?.trim() ?? "";
  if (reason.length < MIN_REVIEW_REASON) return { ok: false, code: "REASON_REQUIRED" };

  return db.$transaction(async (tx) => {
    /* The same row lock every product edit takes, so a price change and a
       review are serialised: the review covers what is committed, or is stale. */
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${params.productId}::uuid FOR UPDATE`;
    const before = await tx.product.findUnique({ where: { id: params.productId }, select: { commercialReview: true } });
    const offer = await currentOffer(tx, params.productId);
    if (!before || !offer) return { ok: false, code: "NOT_FOUND" } as const;
    if (!sameOffer(offer, params.seen)) return { ok: false, code: "STALE" } as const;

    if (offer.variants.length === 0) return { ok: false, code: "NOT_REVIEWABLE", detail: "The product has no active variant to review" } as const;
    if (!offer.deliverySpeed) return { ok: false, code: "NOT_REVIEWABLE", detail: "Choose the delivery class (express or scheduled) on the product first" } as const;
    if (!offer.hsn || offer.gstRatePct === null) {
      return { ok: false, code: "NOT_REVIEWABLE", detail: "This category has no confirmed HSN and GST rate, so checkout cannot tax it" } as const;
    }
    for (const v of offer.variants) {
      const problem = priceProblem(v.pricePaise, v.compareAtPaise);
      if (problem) return { ok: false, code: "NOT_REVIEWABLE", detail: `${v.sku}: ${problem}` } as const;
    }

    const review = commercialReviewSchema.parse({
      approvedBy: params.actor.email,
      approvedAt: new Date().toISOString(),
      reason,
      unitLabel: offer.unitLabel,
      deliverySpeed: offer.deliverySpeed,
      hsn: offer.hsn,
      gstRatePct: offer.gstRatePct,
      inventoryMode: "tracked",
      variants: offer.variants.map((v) => ({ sku: v.sku, pack: v.name, name: v.name, isDefault: v.isDefault, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise })),
    });
    await tx.product.update({ where: { id: params.productId }, data: { commercialReview: review as unknown as Prisma.InputJsonValue } });

    const prior = commercialReviewSchema.safeParse(before.commercialReview);
    await recordAudit(tx, {
      actorType: "admin",
      actorId: params.actor.id,
      action: "catalogue.commercial_review_recorded",
      entityType: "product",
      entityId: params.productId,
      before: prior.success ? { approvedBy: prior.data.approvedBy, approvedAt: prior.data.approvedAt } : { review: null },
      after: review as unknown as Prisma.InputJsonValue,
    });

    /* Whatever still stops a sale — identity, photo, stock — is the caller's to show. */
    return { ok: true, remaining: await validateCommercialReadiness(tx, params.productId) } as const;
  });
}
