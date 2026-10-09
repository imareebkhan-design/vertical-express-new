import type { Prisma } from "@/prisma/generated/client/client";
import { QA_FIXTURE_PREFIX, isLiveCommerce } from "@/lib/catalog/qa-fixture-ids";

/** Customer-visible photos require a recorded identity decision, not provenance alone. */
export function approvedImageWhere(): Prisma.ProductImageWhereInput {
  return {
    sourceVerified: true,
    identityApproved: true,
    approvalStatus: { in: ["APPROVED_EXACT", "APPROVED_WITH_LIMITATION"] },
    OR: [{ severity: null }, { severity: { in: ["P2", "P3"] } }],
    approvedAt: { not: null },
    approvedBy: { not: "" },
    approvalReason: { not: "" },
    sha256: { not: null },
  };
}

/** The public boundary used by listings, direct URLs, counts and search. */
export function catalogIdentityWhere(): Prisma.ProductWhereInput {
  return {
    identityConfirmed: true,
    identityApprovedAt: { not: null },
    identityApprovedBy: { not: "" },
    identityApprovalReason: { not: "" },
    brand: { isActive: true },
    category: { isActive: true },
    images: { some: { isPrimary: true, ...approvedImageWhere() } },
  };
}

export function publicProductWhere(): Prisma.ProductWhereInput {
  const base: Prisma.ProductWhereInput = { ...catalogIdentityWhere(), status: { in: ["catalog_only", "published"] } };
  /* The staging QA fixture can never be shown or sold where real money moves,
     even if a staging copy reached that database. */
  return isLiveCommerce() ? { ...base, NOT: { slug: { startsWith: QA_FIXTURE_PREFIX } } } : base;
}

/** Listings need a real default variant for sellable records; catalogue-only never prices one. */
export function catalogListingWhere(minPaise?: number, maxPaise?: number): Prisma.ProductWhereInput {
  const priced = minPaise != null || maxPaise != null;
  const sellable: Prisma.ProductWhereInput = {
    status: "published",
    // Missing/revoked owner review must not advertise a product as for sale.
    // Material product/variant edits clear this record in database triggers.
    commercialReview: { path: ["approvedBy"], not: "" },
    variants: { some: { isDefault: true, isActive: true,
      pricePaise: { gt: 0, ...(minPaise != null ? { gte: minPaise } : {}), ...(maxPaise != null ? { lte: maxPaise } : {}) },
    }, none: { isActive: true, OR: [
      { pricePaise: { lte: 0 } },
      { inventory: { none: { warehouse: { isActive: true } } } },
    ] } },
  };
  return { AND: [publicProductWhere(), priced ? sellable : { OR: [sellable, { status: "catalog_only" }] }] };
}
