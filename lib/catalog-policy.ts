import type { Prisma } from "@/prisma/generated/client/client";
import { QA_FIXTURE_PREFIX } from "@/lib/catalog/qa-fixture-ids";
import { strictCatalogue } from "@/lib/deploy-env";
import { orderingOpen } from "@/lib/commerce-mode";

/**
 * Licence codes that record attested reuse rights for a product photo.
 * `manufacturer-official-dealer-use` is the owner's dealer-rights decision for the
 * launch catalogue. Free-text licences such as "independent licence not attested"
 * (the cement ranges, 11 Oct 2026) are not here. Adding a code is an owner decision.
 * `homerun-library-owner-licensed`: owner, 17 Oct 2026, in writing — the HomeRun image
 * library is licensed for Vertical Express. Rights only: identity is still approved per photo
 * (docs/catalog/homerun-production-images-2026-10-17).
 */
export const ATTESTED_IMAGE_LICENCES = ["manufacturer-official-dealer-use", "homerun-library-owner-licensed"] as const;

/** Customer-visible photos require a recorded identity decision, not provenance alone. */
export function approvedImageWhere(): Prisma.ProductImageWhereInput {
  /* In production an approval is not enough: the photo must also carry attested
     reuse rights, so a staging approval recorded with rights unconfirmed can never
     become a production listing on its own (owner, 11 Oct 2026). `strictCatalogue`
     fails closed: an undeclared or contradictory deployment counts as production. */
  const rights: Prisma.ProductImageWhereInput = strictCatalogue() ? { licence: { in: [...ATTESTED_IMAGE_LICENCES] } } : {};
  return {
    ...rights,
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

/**
 * What review has established about the product itself: confirmed identity and
 * an approved primary photo. Says nothing about whether customers may see it.
 *
 * The publish gates use this, so a product can be prepared (catalogue-only or
 * published) while its brand or category is switched off (owner, 12 Nov 2026,
 * Launch Control PR-4). Exposure stays with `catalogIdentityWhere` below, which
 * every customer path — listings, search, API, cart, checkout — still requires.
 */
export function productReadinessWhere(): Prisma.ProductWhereInput {
  return {
    identityConfirmed: true,
    identityApprovedAt: { not: null },
    identityApprovedBy: { not: "" },
    identityApprovalReason: { not: "" },
    images: { some: { isPrimary: true, ...approvedImageWhere() } },
  };
}

/** The public boundary used by listings, direct URLs, counts and search: readiness plus an active brand and category. */
export function catalogIdentityWhere(): Prisma.ProductWhereInput {
  return {
    ...productReadinessWhere(),
    brand: { isActive: true },
    category: { isActive: true },
  };
}

/**
 * Which statuses the storefront shows, by how this deployment trades.
 *
 * Transactional (the agreed launch: browse, see a price, order, pay): only
 * `published`. A catalogue-only product is incomplete — no confirmed price,
 * stock or variant — and stays out of the shop rather than being shown with
 * an enquiry button in place of a price. Catalogue mode shows both, because
 * there nothing is bought and every product takes an enquiry.
 */
export function shownProductStatuses(): ("published" | "catalog_only")[] {
  return orderingOpen() ? ["published"] : ["catalog_only", "published"];
}

export function publicProductWhere(): Prisma.ProductWhereInput {
  const base: Prisma.ProductWhereInput = { ...catalogIdentityWhere(), status: { in: shownProductStatuses() } };
  /* The staging QA fixture can never be shown or sold where real money moves,
     even if a staging copy reached that database. */
  return strictCatalogue() ? { ...base, NOT: { slug: { startsWith: QA_FIXTURE_PREFIX } } } : base;
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
  const withCatalogueOnly = !priced && shownProductStatuses().includes("catalog_only");
  return { AND: [publicProductWhere(), withCatalogueOnly ? { OR: [sellable, { status: "catalog_only" }] } : sellable] };
}
