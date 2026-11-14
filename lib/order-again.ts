/**
 * "Order again" — the returning customer's home rail (W-07), from their own
 * orders and nothing else. Pure and client-safe.
 *
 * A port of the native app's `mobile/src/lib/order-again.ts`, so the phone-web
 * home and the app lead with the same thing:
 *
 * It shows what they bought, how many, and when. It does not show the price
 * they paid: prices move, the cart stores none, and a rail quoting last month's
 * ₹465 beside today's ₹480 would be a promise the checkout breaks. Adding an
 * item puts it in the cart at today's server-resolved price.
 *
 * Only orders that count as history are used — the same statuses `/api/v1/me`
 * counts for `orderCount` (see `HISTORY_EXCLUDED`). An order abandoned at
 * payment, cancelled or refunded is not evidence the customer wanted the thing.
 * Items whose product is no longer sold (no slug) are skipped, because the rail
 * must never offer what cannot be bought.
 */

/** Statuses that are not order history — `/api/v1/me`'s `HISTORY_STATUSES` excludes the same four. */
export const HISTORY_EXCLUDED = ["pending_payment", "cancelled", "refunded", "refund_initiated"] as const;

export interface OrderAgainSourceOrder {
  status: string;
  /** ISO string or Date. */
  placedAt: string | Date;
  items: {
    variantId: string;
    title: string;
    variantName: string;
    imageUrl: string | null;
    qty: number;
    /** The product's slug, or null when it is no longer sold. */
    productSlug: string | null;
  }[];
}

export interface OrderAgainItem {
  variantId: string;
  productSlug: string;
  title: string;
  variantName: string;
  imageUrl: string | null;
  lastQty: number;
  /** ISO string. */
  lastOrderedAt: string;
  /** How many of the customer's orders contained it. */
  timesOrdered: number;
}

const NOT_HISTORY = new Set<string>(HISTORY_EXCLUDED);

export function orderAgainFrom(orders: OrderAgainSourceOrder[], limit = 8): OrderAgainItem[] {
  const byVariant = new Map<string, OrderAgainItem>();
  const time = (d: string | Date) => (d instanceof Date ? d.getTime() : Date.parse(d));
  const newestFirst = [...orders].sort((a, b) => time(b.placedAt) - time(a.placedAt));

  for (const order of newestFirst) {
    if (NOT_HISTORY.has(order.status)) continue;
    for (const item of order.items) {
      if (!item.variantId || !item.productSlug) continue;
      const seen = byVariant.get(item.variantId);
      if (seen) {
        seen.timesOrdered += 1;
        continue;
      }
      byVariant.set(item.variantId, {
        variantId: item.variantId,
        productSlug: item.productSlug,
        title: item.title,
        variantName: item.variantName,
        imageUrl: item.imageUrl,
        lastQty: item.qty,
        lastOrderedAt: new Date(time(order.placedAt)).toISOString(),
        timesOrdered: 1,
      });
    }
  }
  return [...byVariant.values()].slice(0, limit);
}

/** "40 on 15 Aug" — what they last took. Dated in the market's time zone. */
export function lastOrderedLabel(item: Pick<OrderAgainItem, "lastQty" | "lastOrderedAt">): string {
  const date = new Date(item.lastOrderedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
  return `${item.lastQty} on ${date}`;
}
