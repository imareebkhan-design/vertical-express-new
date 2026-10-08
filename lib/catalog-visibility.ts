/**
 * Catalogue visibility vs purchasability — the one place both are defined.
 *
 * `published`    — visible AND purchasable. The publish guard requires an active
 *                  variant priced above zero before a product may enter it.
 * `catalog_only` — visible, NOT purchasable. Identity and an approved exact photo
 *                  are known; price, stock or variants are not. The storefront
 *                  shows PRICE_ON_REQUEST_LABEL instead of a price and never
 *                  offers Add to Cart; the cart and checkout refuse its variants.
 * `draft`, `archived` — not visible.
 *
 * Web pages, /api/v1 (which the Expo app consumes) and search all read these
 * constants, so web and app cannot disagree about what is shown or sold.
 */
import type { CatalogItem } from "@/lib/services/catalog";

export const VISIBLE_PRODUCT_STATUSES = ["published", "catalog_only"] as const;
export const PURCHASABLE_PRODUCT_STATUS = "published" as const;

/** Shown in place of a price on catalog-only products. Change it here only. */
export const PRICE_ON_REQUEST_LABEL = "Price on request";

export function isVisibleStatus(status: string): boolean {
  return (VISIBLE_PRODUCT_STATUSES as readonly string[]).includes(status);
}

export function isPurchasableStatus(status: string): boolean {
  return status === PURCHASABLE_PRODUCT_STATUS;
}

/** A card that can be sold: it has a variant and a price. */
export type PurchasableCatalogItem = CatalogItem & { purchasable: true; variantId: string; pricePaise: number };

/** Narrows a card to a sellable one. Deals and order-history rails use it,
 *  since only purchasable products can be on a deal or in an order. */
export function isPurchasableItem(item: CatalogItem): item is PurchasableCatalogItem {
  return item.purchasable && item.variantId !== null && item.pricePaise !== null;
}
