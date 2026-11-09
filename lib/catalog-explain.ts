/**
 * Why a product is, or is not, in front of customers — explained, not decided.
 *
 * The storefront decides with Prisma filters (`publicProductWhere`,
 * `catalogListingWhere` in lib/catalog-policy.ts) and that stays the only
 * authority. This module restates the same rule as a pure function over one
 * product's state, so the console can say *why*: every reason that applies,
 * not just the first, each with a stable code.
 *
 * Three layers, kept apart on purpose:
 *   exposure  — what an operator switched: category, brand, status
 *   readiness — what review established: identity, photo, offer, stock record
 *   commerce  — whether this deployment takes orders at all (COMMERCE_MODE)
 *
 * `lib/__tests__/catalog-explain-parity.test.ts` runs both against the same
 * database rows and fails on any disagreement, so the two cannot drift. If you
 * change one, change the other.
 *
 * Pure and dependency-light: no database, no `server-only`.
 */
import { ATTESTED_IMAGE_LICENCES } from "@/lib/catalog-policy";
import { QA_FIXTURE_PREFIX } from "@/lib/catalog/qa-fixture-ids";

export type ReasonLayer = "exposure" | "readiness" | "commerce";

export const CATALOG_REASONS = {
  STATUS_DRAFT: { layer: "exposure", message: "The product is a draft" },
  STATUS_ARCHIVED: { layer: "exposure", message: "The product is archived" },
  STATUS_CATALOG_ONLY_NOT_SHOWN: { layer: "exposure", message: "Catalogue-only products are not shown while the shop takes orders" },
  CATEGORY_HIDDEN: { layer: "exposure", message: "The category is switched off" },
  BRAND_HIDDEN: { layer: "exposure", message: "The brand is switched off" },
  QA_FIXTURE_IN_STRICT: { layer: "exposure", message: "A staging test product is never shown on a production deployment" },
  IDENTITY_UNCONFIRMED: { layer: "readiness", message: "Product identity has not been confirmed and approved" },
  PHOTO_UNAPPROVED: { layer: "readiness", message: "No approved exact primary photo" },
  PHOTO_LICENCE_UNATTESTED: { layer: "readiness", message: "The primary photo's reuse rights are not attested for production" },
  NO_COMMERCIAL_REVIEW: { layer: "readiness", message: "No owner commercial review is recorded" },
  NO_ACTIVE_DEFAULT_VARIANT: { layer: "readiness", message: "No active default variant priced above zero" },
  VARIANT_PRICE_INVALID: { layer: "readiness", message: "An active variant has no selling price above zero" },
  NO_STOCK_RECORD: { layer: "readiness", message: "An active variant has no stock record at an active warehouse (zero is allowed)" },
  NOT_PUBLISHED: { layer: "readiness", message: "Catalogue-only: shown, but not for sale" },
  COMMERCIAL_CHECK_FAILED: { layer: "readiness", message: "The commercial readiness check does not pass" },
  ORDERING_CLOSED: { layer: "commerce", message: "This deployment takes enquiries, not orders" },
} as const satisfies Record<string, { layer: ReasonLayer; message: string }>;

export type ReasonCode = keyof typeof CATALOG_REASONS;

export interface CatalogReason {
  code: ReasonCode;
  layer: ReasonLayer;
  /** What this reason stops: being seen at all, or only being bought. */
  blocks: "visibility" | "purchase";
  message: string;
  /** Extra detail, e.g. the failing commercial check's own wording. */
  detail?: string;
}

/** One product as the rule needs it. Field names match the Prisma models. */
export interface CatalogStateSnapshot {
  slug: string;
  status: "draft" | "catalog_only" | "published" | "archived";
  identityConfirmed: boolean;
  identityApprovedAt: Date | null;
  identityApprovedBy: string | null;
  identityApprovalReason: string | null;
  commercialReview: unknown;
  brand: { isActive: boolean };
  category: { isActive: boolean };
  /** Primary images only. */
  images: {
    licence: string | null;
    sourceVerified: boolean;
    identityApproved: boolean;
    approvalStatus: string;
    severity: string | null;
    approvedAt: Date | null;
    approvedBy: string | null;
    approvalReason: string | null;
    sha256: string | null;
  }[];
  variants: {
    isDefault: boolean;
    isActive: boolean;
    pricePaise: number;
    inventory: { warehouse: { isActive: boolean } }[];
  }[];
}

export interface CatalogStateContext {
  /** `orderingOpen()` — COMMERCE_MODE allows orders. */
  orderingOpen: boolean;
  /** `strictCatalogue()` — production catalogue rules apply. */
  strict: boolean;
  /**
   * `validateCommercialReadiness` for this product, when the caller ran it.
   * Omitted: purchasability is reported as unknown rather than guessed.
   */
  commercialIssues?: readonly string[];
}

export interface CatalogState {
  visible: boolean;
  /** Null when `commercialIssues` was not supplied and the product would otherwise be purchasable. */
  purchasable: boolean | null;
  action: "buy" | "enquire" | "hidden" | "unknown";
  reasons: CatalogReason[];
}

/** Prisma's `{ not: "" }` on a nullable column excludes NULL as well. */
const filled = (s: string | null | undefined): boolean => s != null && s !== "";

function approvedImage(img: CatalogStateSnapshot["images"][number], strict: boolean): { ok: boolean; licenceOnly: boolean } {
  const base =
    img.sourceVerified &&
    img.identityApproved &&
    (img.approvalStatus === "APPROVED_EXACT" || img.approvalStatus === "APPROVED_WITH_LIMITATION") &&
    (img.severity == null || img.severity === "P2" || img.severity === "P3") &&
    img.approvedAt != null &&
    filled(img.approvedBy) &&
    filled(img.approvalReason) &&
    img.sha256 != null;
  const licensed = !strict || (ATTESTED_IMAGE_LICENCES as readonly string[]).includes(img.licence ?? "");
  return { ok: base && licensed, licenceOnly: base && !licensed };
}

function reviewApprovedBy(review: unknown): boolean {
  if (review == null || typeof review !== "object" || Array.isArray(review)) return false;
  const v = (review as Record<string, unknown>).approvedBy;
  return v !== undefined && v !== null && v !== "";
}

function reason(code: ReasonCode, blocks: CatalogReason["blocks"], detail?: string): CatalogReason {
  const r = CATALOG_REASONS[code];
  return { code, layer: r.layer, blocks, message: r.message, ...(detail ? { detail } : {}) };
}

/**
 * The state of one product under the storefront rule, with every reason that
 * applies. Mirrors `catalogListingWhere()` (no price filter) for `visible`, and
 * `addItem`/checkout for `purchasable` (published ∧ listed ∧ commercial
 * readiness ∧ ordering open). Stock quantity and serviceability are decided at
 * checkout and are not part of this answer.
 */
export function explainCatalogState(p: CatalogStateSnapshot, ctx: CatalogStateContext): CatalogState {
  const hide: CatalogReason[] = [];
  const shown: CatalogStateSnapshot["status"][] = ctx.orderingOpen ? ["published"] : ["catalog_only", "published"];

  // publicProductWhere
  if (p.status === "draft") hide.push(reason("STATUS_DRAFT", "visibility"));
  else if (p.status === "archived") hide.push(reason("STATUS_ARCHIVED", "visibility"));
  else if (!shown.includes(p.status)) hide.push(reason("STATUS_CATALOG_ONLY_NOT_SHOWN", "visibility"));
  if (!p.category.isActive) hide.push(reason("CATEGORY_HIDDEN", "visibility"));
  if (!p.brand.isActive) hide.push(reason("BRAND_HIDDEN", "visibility"));
  if (ctx.strict && p.slug.startsWith(QA_FIXTURE_PREFIX)) hide.push(reason("QA_FIXTURE_IN_STRICT", "visibility"));
  if (!(p.identityConfirmed && p.identityApprovedAt != null && filled(p.identityApprovedBy) && filled(p.identityApprovalReason))) {
    hide.push(reason("IDENTITY_UNCONFIRMED", "visibility"));
  }
  const photos = p.images.map((i) => approvedImage(i, ctx.strict));
  if (!photos.some((x) => x.ok)) {
    hide.push(reason(photos.some((x) => x.licenceOnly) ? "PHOTO_LICENCE_UNATTESTED" : "PHOTO_UNAPPROVED", "visibility"));
  }

  // catalogListingWhere: the sellable branch, or catalogue-only where it is shown.
  const offer: CatalogReason[] = [];
  if (!reviewApprovedBy(p.commercialReview)) offer.push(reason("NO_COMMERCIAL_REVIEW", "visibility"));
  const active = p.variants.filter((v) => v.isActive);
  if (!active.some((v) => v.isDefault && v.pricePaise > 0)) offer.push(reason("NO_ACTIVE_DEFAULT_VARIANT", "visibility"));
  if (active.some((v) => v.pricePaise <= 0)) offer.push(reason("VARIANT_PRICE_INVALID", "visibility"));
  if (active.some((v) => !v.inventory.some((i) => i.warehouse.isActive))) offer.push(reason("NO_STOCK_RECORD", "visibility"));
  const listedAsCatalogueOnly = p.status === "catalog_only" && shown.includes("catalog_only");
  if (p.status === "published") hide.push(...offer);

  const visible = hide.length === 0;
  if (!visible) return { visible, purchasable: false, action: "hidden", reasons: hide };

  // Visible. Can it be bought?
  const buy: CatalogReason[] = [];
  if (listedAsCatalogueOnly) buy.push(reason("NOT_PUBLISHED", "purchase"));
  if (p.status === "published" && ctx.commercialIssues?.length) {
    buy.push(...ctx.commercialIssues.map((d) => reason("COMMERCIAL_CHECK_FAILED", "purchase", d)));
  }
  if (!ctx.orderingOpen) buy.push(reason("ORDERING_CLOSED", "purchase"));

  if (buy.length) return { visible, purchasable: false, action: "enquire", reasons: buy };
  if (ctx.commercialIssues === undefined) return { visible, purchasable: null, action: "unknown", reasons: [] };
  return { visible, purchasable: true, action: "buy", reasons: [] };
}
