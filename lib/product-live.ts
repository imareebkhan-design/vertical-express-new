/**
 * Getting one product live — what is done, what is left, and where to do it.
 *
 * Decides nothing. The publish gate (`sellableReasons`, publish-guard.ts) and
 * the storefront rule (`explainCatalogState`, catalog-explain.ts) stay the only
 * authorities; this file turns their answers, and the product's own state, into
 * an ordered list an operator can work down, each line next to the place that
 * fixes it. Anything the gate reports that no step here covers is passed
 * through word for word (`other`), so a new gate reason can never be hidden by
 * an old checklist.
 *
 * Pure and client-safe: no database, no `server-only`.
 */
import type { CatalogState } from "@/lib/catalog-explain";

export type ProductStatus = "draft" | "catalog_only" | "published" | "archived";

/** The four statuses, in the words the console uses everywhere. */
export const STATUS_MEANING: Record<ProductStatus, { label: string; meaning: string }> = {
  draft: {
    label: "Draft",
    meaning: "Only the dashboard can see it. Customers cannot find it in search, in its category or by its link.",
  },
  catalog_only: {
    label: "Catalogue only",
    meaning: "Shown to customers with an enquiry button and no price, where the site is taking enquiries. Never sold.",
  },
  published: {
    label: "Published",
    meaning: "On the storefront. Whether it can be bought right now depends on the checks listed under “On the storefront”.",
  },
  archived: {
    label: "Archived",
    meaning: "Retired. Hidden from customers everywhere; kept so old orders, stock history and approvals still read correctly.",
  },
};

export type StepKey = "photo" | "approval" | "price" | "stock" | "delivery" | "tax" | "review";

export interface LiveStep {
  key: StepKey;
  title: string;
  done: boolean;
  /** What is missing, or what was found. One sentence. */
  detail: string;
  /** Where it is fixed: an anchor on the product page, or another screen. Null when nothing here can fix it. */
  href: string | null;
  /** The words on that link. */
  action: string | null;
}

export interface LiveInput {
  slug: string;
  hasLeadPhoto: boolean;
  /** The lead photo's own approval decision. */
  leadPhotoApproved: boolean;
  /** In production only an attested licence is shown; true when the lead photo's is not. */
  licenceUnattested: boolean;
  identityConfirmed: boolean;
  /** Active variants only. */
  variants: { sku: string; name: string; isDefault: boolean; pricePaise: number; compareAtPaise: number | null; hasStockRecord: boolean }[];
  deliverySpeed: string | null;
  /** The category's confirmed HSN and GST rate, or null when it has none. */
  taxConfigured: boolean;
  categoryName: string;
  /** A price and tax review is on file and still matches the offer. */
  reviewCurrent: boolean;
  reviewOnFile: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The steps to publication, in the order they are done. */
export function liveSteps(p: LiveInput): LiveStep[] {
  const base = `/admin/products/${p.slug}`;
  const def = p.variants.find((v) => v.isDefault);
  const unpriced = p.variants.filter((v) => v.pricePaise <= 0);
  const noMrp = p.variants.filter((v) => v.compareAtPaise == null);
  const mrpBelow = p.variants.filter((v) => v.compareAtPaise != null && v.compareAtPaise < v.pricePaise);
  const noStock = p.variants.filter((v) => !v.hasStockRecord);

  const priceProblems = [
    p.variants.length === 0 ? "There is no pack to sell" : null,
    p.variants.length > 0 && !def ? "No pack is set as the one the product leads with" : null,
    unpriced.length ? `${unpriced.map((v) => v.name).join(", ")} ${plural(unpriced.length, "has", "have")} no selling price` : null,
    noMrp.length ? `${noMrp.map((v) => v.name).join(", ")} ${plural(noMrp.length, "has", "have")} no MRP recorded` : null,
    mrpBelow.length ? `${mrpBelow.map((v) => v.name).join(", ")}: the MRP is below the selling price` : null,
  ].filter((x): x is string => x !== null);

  return [
    {
      key: "photo",
      title: "Add the lead photo",
      done: p.hasLeadPhoto,
      detail: p.hasLeadPhoto ? "A lead photo is attached." : "No lead photo. Upload one and tick “Lead photo”.",
      href: `${base}#photos`,
      action: p.hasLeadPhoto ? "Change photo" : "Upload a photo",
    },
    {
      key: "approval",
      title: "Confirm the product and approve its photo",
      done: p.identityConfirmed && p.leadPhotoApproved && !p.licenceUnattested,
      detail: !p.hasLeadPhoto
        ? "Needs the lead photo first."
        : p.licenceUnattested
          ? "The lead photo’s licence is not one that is shown to customers on the live site. Upload it again with an attested licence."
          : p.identityConfirmed && p.leadPhotoApproved
            ? "The product’s identity is confirmed and its lead photo is approved."
            : "Check the photo against the name and pack, then record the decision. Editing the name, brand, unit or specifications afterwards clears it.",
      href: p.hasLeadPhoto ? `${base}#approval` : `${base}#photos`,
      action: p.identityConfirmed && p.leadPhotoApproved ? null : p.hasLeadPhoto ? "Record approval" : "Upload a photo",
    },
    {
      key: "price",
      title: "Selling price and MRP on every pack",
      done: priceProblems.length === 0,
      detail: priceProblems.length === 0 ? "Every pack has a selling price and an MRP at or above it." : `${priceProblems.join(". ")}.`,
      href: `${base}#pricing`,
      action: priceProblems.length === 0 ? null : "Set prices",
    },
    {
      key: "stock",
      title: "Stock record at a warehouse",
      done: p.variants.length > 0 && noStock.length === 0,
      detail:
        p.variants.length > 0 && noStock.length === 0
          ? "Every pack has a stock record. Zero is allowed; quantities are counted in on Inventory."
          : `${noStock.map((v) => v.name).join(", ") || "The product"} ${plural(noStock.length || 1, "has", "have")} no stock record, so stock is unknown rather than zero.`,
      href: `${base}#stock`,
      action: p.variants.length > 0 && noStock.length === 0 ? null : "Create stock record",
    },
    {
      key: "delivery",
      title: "Choose how it travels",
      done: p.deliverySpeed === "express" || p.deliverySpeed === "scheduled",
      detail:
        p.deliverySpeed === "express" || p.deliverySpeed === "scheduled"
          ? `Delivery is set to ${p.deliverySpeed === "express" ? "fast — out from the store" : "heavy — by truck"}.`
          : "Delivery is still “inherit from category”. Pick fast or heavy for this product, then Save; the price review cannot be recorded without it.",
      href: `${base}#basics`,
      action: p.deliverySpeed === "express" || p.deliverySpeed === "scheduled" ? null : "Choose delivery",
    },
    {
      key: "tax",
      title: "GST rate for the category",
      done: p.taxConfigured,
      detail: p.taxConfigured
        ? `${p.categoryName} has a confirmed HSN code and GST rate.`
        : `${p.categoryName} has no confirmed HSN code and GST rate, so checkout cannot tax it. This is set in code from the CA’s figures, not on a screen — it needs a developer.`,
      href: null,
      action: null,
    },
    {
      key: "review",
      title: "Record the price and tax review",
      done: p.reviewCurrent,
      detail: p.reviewCurrent
        ? "A named person has checked the prices, packs and tax as they stand."
        : p.reviewOnFile
          ? "The review on file no longer matches: a price, pack, unit or delivery choice changed since. Record it again."
          : "Nobody has recorded checking the prices, packs and tax. Do this last: changing a price or a pack clears it.",
      href: `${base}#review`,
      action: p.reviewCurrent ? null : "Record review",
    },
  ];
}

/**
 * The publish gate's own reasons that no step above already says.
 *
 * Matching is by the gate's wording, so it is deliberately loose: a reason
 * that is not recognised is shown, never dropped.
 */
export function uncoveredReasons(reasons: readonly string[]): string[] {
  const covered = [
    /default variant/i, /selling price/i, /MRP/i, /stock/i, /HSN|GST|tax/i, /photo|image/i,
    /identity/i, /commercial review|pack review|Unit\/pack review|since commercial review/i,
    /Delivery classification/i, /price must be|compare|below/i,
  ];
  return reasons.filter((r) => !covered.some((c) => c.test(r)));
}

export interface StorefrontLine {
  label: string;
  /** ok: nothing stopping it; no: stops it; note: true but worth knowing. */
  tone: "ok" | "no" | "note";
  text: string;
  href?: string;
  action?: string;
}

export interface StorefrontInput {
  status: ProductStatus;
  state: CatalogState;
  categoryName: string;
  categoryActive: boolean;
  brandName: string;
  brandActive: boolean;
  /** Units available to sell across active warehouses, default pack. */
  availableUnits: number;
  orderingOpen: boolean;
  /** Pincodes the shop delivers to right now. */
  serviceablePincodes: number;
}

/**
 * What a customer actually gets, line by line. `state` is the storefront rule's
 * own answer; the lines around it are the things that rule does not cover and
 * a checkout decides later — stock on hand and the delivery area.
 */
export function storefrontLines(p: StorefrontInput): { headline: string; lines: StorefrontLine[] } {
  const { state } = p;
  const lines: StorefrontLine[] = [];

  lines.push(
    state.visible
      ? { label: "Shown to customers", tone: "ok", text: "Yes — in search, in its category and at its own link." }
      : {
          label: "Shown to customers",
          tone: "no",
          text: `No. ${state.reasons.filter((r) => r.blocks === "visibility").map((r) => r.message).join(". ")}.`,
        }
  );
  lines.push(
    p.categoryActive
      ? { label: "Category", tone: "ok", text: `${p.categoryName} is switched on in Launch control.` }
      : {
          label: "Category",
          tone: "no",
          text: `${p.categoryName} is switched off, so nothing in it is shown.`,
          href: "/admin/launch-control",
          action: "Open Launch control",
        }
  );
  lines.push(
    p.brandActive
      ? { label: "Brand", tone: "ok", text: `${p.brandName} is switched on.` }
      : { label: "Brand", tone: "no", text: `${p.brandName} is switched off, so its products are not shown.`, href: "/admin/launch-control", action: "Open Launch control" }
  );
  lines.push(
    p.orderingOpen
      ? { label: "Ordering", tone: "ok", text: "This site takes orders." }
      : { label: "Ordering", tone: "note", text: "This site is in catalogue mode: customers see the product and send an enquiry. Nothing can be ordered or paid for here, whatever the product’s status." }
  );
  if (p.status === "published") {
    const buyIssues = state.reasons.filter((r) => r.blocks === "purchase" && r.code === "COMMERCIAL_CHECK_FAILED");
    if (buyIssues.length > 0) {
      lines.push({
        label: "Price check",
        tone: "no",
        text: `The cart refuses it: ${buyIssues.map((r) => r.detail ?? r.message).join("; ")}.`,
      });
    }
    lines.push(
      p.availableUnits > 0
        ? { label: "Stock", tone: "ok", text: `${p.availableUnits} available to sell.` }
        : { label: "Stock", tone: "no", text: "None available, so it shows as out of stock and cannot be added to a cart.", href: "/admin/inventory", action: "Count stock in" }
    );
    lines.push(
      p.serviceablePincodes > 0
        ? {
            label: "Delivery area",
            tone: "ok",
            text: `Deliverable to ${p.serviceablePincodes} ${plural(p.serviceablePincodes, "pincode", "pincodes")}. A customer anywhere else can look but cannot check out.`,
            href: "/admin/serviceability",
            action: "Service areas",
          }
        : { label: "Delivery area", tone: "no", text: "No pincode is switched on, so nobody can check out.", href: "/admin/serviceability", action: "Service areas" }
    );
  }

  const canBuy =
    state.visible && state.action === "buy" && p.availableUnits > 0 && p.serviceablePincodes > 0;
  const headline = !state.visible
    ? "Customers cannot see this product."
    : canBuy
      ? "Customers can see this product and buy it."
      : state.action === "enquire"
        ? "Customers can see this product and send an enquiry. They cannot buy it."
        : "Customers can see this product but cannot buy it yet.";
  return { headline, lines };
}
