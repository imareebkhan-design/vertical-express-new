import type { DealOfTheDayConfig } from "./home";

/** The catalogue fields a deal is allowed to show. All of them come from the database. */
export interface DealProduct {
  slug: string;
  title: string;
  brandName: string;
  imageUrl: string | null;
  unitLabel: string;
  pricePaise: number;
  compareAtPaise: number | null;
  inStock: boolean;
}

export type DealView =
  | { state: "coming-soon" }
  | {
      state: "live";
      headline: string | null;
      title: string;
      brandName: string;
      imageUrl: string | null;
      unitLabel: string;
      href: string;
      pricePaise: number;
      /** Present only when the catalogue carries a compare-at price above the selling price. */
      mrpPaise: number | null;
      /** Whole percent off MRP, rounded down so it never overstates. Null without an MRP. */
      discountPercent: number | null;
      /** Present only when the config sets a valid, future expiry. */
      expiresAt: Date | null;
    };

/**
 * Decides what the Deal of the Day shows.
 *
 * Every value on a live deal is either read from the catalogue or derived from
 * it; nothing is invented to fill a gap. Anything that does not hold up — no
 * deal configured, the product not published or out of stock, the expiry
 * passed, a malformed expiry — falls back to "coming soon" rather than
 * showing a deal that is not real.
 */
export function resolveDealOfTheDay(
  config: DealOfTheDayConfig | null,
  product: DealProduct | null,
  now: Date
): DealView {
  if (!config || !product || product.slug !== config.productSlug || !product.inStock) {
    return { state: "coming-soon" };
  }
  if (!Number.isInteger(product.pricePaise) || product.pricePaise <= 0) return { state: "coming-soon" };

  let expiresAt: Date | null = null;
  if (config.expiresAt !== undefined) {
    const t = Date.parse(config.expiresAt);
    // A deadline nobody can read is not a deadline; nor is one already past.
    if (Number.isNaN(t) || t <= now.getTime()) return { state: "coming-soon" };
    expiresAt = new Date(t);
  }

  const mrp =
    product.compareAtPaise !== null && Number.isInteger(product.compareAtPaise) && product.compareAtPaise > product.pricePaise
      ? product.compareAtPaise
      : null;

  return {
    state: "live",
    headline: config.headline?.trim() || null,
    title: product.title,
    brandName: product.brandName,
    imageUrl: product.imageUrl,
    unitLabel: product.unitLabel,
    href: `/product/${product.slug}`,
    pricePaise: product.pricePaise,
    mrpPaise: mrp,
    discountPercent: mrp === null ? null : Math.floor(((mrp - product.pricePaise) * 100) / mrp),
    expiresAt,
  };
}

/** "05:42:09" until `expiresAt`, or null once it has passed. Hours are not capped at 24. */
export function countdownLabel(expiresAt: Date, now: Date): string | null {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
