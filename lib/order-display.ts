/**
 * How an order is described to the customer on the web.
 *
 * Pure and client-safe: the web order detail, the confirmation page and the
 * account lists all render the same order, and before this module each one
 * decided for itself what "items" meant, when a delivery time could be stated,
 * which money lines to show and whether the customer could cancel. They
 * disagreed, and two of the disagreements were false statements to a customer.
 */

import { formatPaise } from "@/lib/money";

/** Any `Shipment.speedClass` — only "express" carries the checkout quote. */
type SpeedClass = string;

/* ------------------------------------------------------------------ cancel */

export interface CancelInput {
  status: string;
  paymentMethod: string;
  /** Latest payment record's status, when there is one. */
  paymentStatus?: string | null;
}

export type CancelState =
  | { kind: "allowed" }
  | { kind: "paid-online" }
  | { kind: "not-cancellable" };

/**
 * Whether the customer may cancel this order themselves from the web.
 *
 * Mirrors the rule `cancelOrder` in `lib/services/orders.ts` enforces
 * (PAID_NOT_CANCELLABLE): nothing refunds a payment — the refund edge is
 * unreachable by design (`lib/order-flow.ts`, ISS-025) until the owner sets a
 * refund policy — so an order paid online is not customer-cancellable, and the
 * screen must not offer it. Unpaid orders (awaiting payment, or cash on
 * delivery before dispatch) involve no money and stay cancellable.
 */
export function customerCancelState(o: CancelInput): CancelState {
  const cancellableStatus = o.status === "pending_payment" || o.status === "confirmed";
  if (!cancellableStatus) return { kind: "not-cancellable" };
  const funds = o.paymentStatus === "captured" || o.paymentStatus === "authorized";
  const paidOnline = funds || (o.paymentMethod !== "cod" && o.status !== "pending_payment");
  return paidOnline ? { kind: "paid-online" } : { kind: "allowed" };
}

/**
 * The customer-facing result for a `cancelOrder` service error — what the web
 * action returns. A paid-order refusal must not be reported as "not found".
 */
export function cancelErrorResult(
  serviceError: string,
  supportEmail: string
): { code: "CONFLICT" | "NOT_FOUND" | "UNAVAILABLE"; message: string } {
  /* E5: the order may have been paid with the confirmation lost. Neither
     message claims the order is unpaid, or that any money is refunded. */
  if (serviceError === "PAYMENT_STATUS_UNKNOWN") {
    return {
      code: "UNAVAILABLE",
      message:
        "We couldn’t check this order’s payment with the bank just now, so it hasn’t been cancelled. Please try again in a few minutes. If you’ve already paid, don’t pay again.",
    };
  }
  if (serviceError === "PAYMENT_IN_PROGRESS") {
    return {
      code: "CONFLICT",
      message:
        "Your bank has approved a payment for this order and it’s still being completed, so it can’t be cancelled right now. Please check back in a few minutes.",
    };
  }
  if (serviceError === "PAID_NOT_CANCELLABLE") {
    return {
      code: "CONFLICT",
      message: `This order is paid, so it can’t be cancelled here. Email ${supportEmail} with the order number.`,
    };
  }
  if (serviceError === "NOT_CANCELLABLE") {
    return { code: "CONFLICT", message: "This order can no longer be cancelled" };
  }
  return { code: "NOT_FOUND", message: "Order not found" };
}

/* ----------------------------------------------------------------- payment */

/** The payment line, stated from what actually happened — not from the method chosen. */
export function paymentLabel(o: CancelInput): string {
  if (o.paymentMethod === "cod") return "Pay on delivery";
  if (o.paymentStatus === "captured" || (o.status !== "pending_payment" && o.status !== "cancelled")) {
    return "Paid online";
  }
  if (o.status === "pending_payment") return "Awaiting payment";
  return "Not paid";
}

/* --------------------------------------------------------------------- eta */

/**
 * Where the checkout quote may be stated — the same rule the native app uses
 * (`mobile/src/lib/shipment-progress.ts`).
 *
 * `Order.etaMinutes` is the pincode's quote for the quick run. A truck
 * shipment has no quoted time (slots do not exist), so on a mixed order the
 * quote belongs to the express shipment only; stated at order level it would
 * promise the cement in two hours too. Orders from before the split have no
 * shipments and keep the order-level quote.
 */
export function etaPlacement(
  etaMinutes: number | null | undefined,
  shipments: { speedClass: SpeedClass }[]
): "order" | "express-shipments" | "none" {
  if (!etaMinutes) return "none";
  if (shipments.length === 0 || shipments.every((s) => s.speedClass === "express")) return "order";
  return shipments.some((s) => s.speedClass === "express") ? "express-shipments" : "none";
}

/** "About 45 minutes" / "About 2 hours" — never "1 hours". */
export function etaPhrase(minutes: number): string {
  if (minutes < 90) return `About ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `About ${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * The single delivery-time sentence for an order, or null when none may be
 * stated. Worded as the quote it is — from dispatch, as quoted at checkout —
 * not as a promise about the clock.
 */
export function etaLine(
  o: { status: string; etaMinutes: number | null | undefined },
  shipments: { speedClass: SpeedClass }[]
): string | null {
  const live = o.status !== "delivered" && o.status !== "cancelled" && o.status !== "pending_payment";
  if (!live || !o.etaMinutes) return null;
  const at = etaPlacement(o.etaMinutes, shipments);
  if (at === "none") return null;
  const quote = `${etaPhrase(o.etaMinutes)} from dispatch, as quoted at checkout.`;
  return at === "order" ? quote : `Quick-delivery items: ${quote.charAt(0).toLowerCase()}${quote.slice(1)} Truck items have no time set yet.`;
}

/**
 * The pincode quote at checkout, before an order exists — same placement rule,
 * applied to the planned shipments. Null when no time may be stated.
 */
export function checkoutQuote(
  etaMinutes: number | null | undefined,
  shipments: { speedClass: SpeedClass }[]
): string | null {
  const at = etaPlacement(etaMinutes, shipments);
  if (at === "none" || !etaMinutes) return null;
  const phrase = etaPhrase(etaMinutes);
  return at === "order"
    ? `${phrase} from dispatch.`
    : `Quick-delivery items: ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)} from dispatch. Truck items have no time set yet.`;
}

/** The placement rule, compact: "About 2 hours", "Quick items: about 2 hours", or "Not scheduled yet". */
export function quoteShort(
  etaMinutes: number | null | undefined,
  shipments: { speedClass: SpeedClass }[]
): string {
  const at = etaPlacement(etaMinutes, shipments);
  if (at === "none" || !etaMinutes) return "Not scheduled yet";
  const phrase = etaPhrase(etaMinutes);
  return at === "order" ? phrase : `Quick items: ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`;
}

/** The same rule for a placed order's stat tile — nothing is stated before payment or once it's over. */
export function etaShort(
  o: { status: string; etaMinutes: number | null | undefined },
  shipments: { speedClass: SpeedClass }[]
): string {
  const live = o.status !== "delivered" && o.status !== "cancelled" && o.status !== "pending_payment";
  return live ? quoteShort(o.etaMinutes, shipments) : "Not scheduled yet";
}

/* ------------------------------------------------------------------ totals */

export interface TotalsInput {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
}

export interface TotalsView {
  lines: { label: string; value: string }[];
  /** Informational only — already netted into the subtotal, never subtracted again. */
  discountNote: string | null;
  total: string;
  /** False only for an order whose stored figures do not add up; the lines are still shown. */
  reconciles: boolean;
}

/**
 * The money breakdown, in the shape the stored figures actually have.
 *
 * `computeTotals` stores `subtotalPaise` as the taxable value *after* any
 * coupon, and `totalPaise = subtotal + tax + delivery`. Showing "Subtotal" and
 * "Total" without the GST line (the desktop order page did) makes the
 * arithmetic on screen impossible; subtracting the discount again would
 * double-count it. No rate is printed: GST differs by category (cement 28%,
 * most else 18%), so a single "18%" label on a mixed order is false.
 */
export function orderTotals(o: TotalsInput): TotalsView {
  const lines: { label: string; value: string }[] = [];
  lines.push({ label: o.taxPaise > 0 ? "Subtotal (before GST)" : "Subtotal", value: formatPaise(o.subtotalPaise) });
  if (o.taxPaise > 0) lines.push({ label: "GST", value: formatPaise(o.taxPaise) });
  lines.push({ label: "Delivery", value: o.deliveryFeePaise === 0 ? "FREE" : formatPaise(o.deliveryFeePaise) });
  return {
    lines,
    discountNote: o.discountPaise > 0 ? `Includes a coupon saving of ${formatPaise(o.discountPaise)}` : null,
    total: formatPaise(o.totalPaise),
    reconciles: o.subtotalPaise + o.taxPaise + o.deliveryFeePaise === o.totalPaise,
  };
}

/* ------------------------------------------------------------------- items */

/**
 * "1 item" / "5 items", counting units — the cart's own definition
 * (`getCartSummary().count` sums quantities) and the native orders list's.
 */
export function itemCountLabel(items: { qty: number }[]): string {
  const n = items.reduce((sum, i) => sum + i.qty, 0);
  return `${n} item${n === 1 ? "" : "s"}`;
}

/* ---------------------------------------------------------- serialisation */

/**
 * An order as a client component may receive it.
 *
 * `OrderItem.gstRate` is a Prisma `Decimal`, a class instance, which a Server
 * Component cannot pass to a client one ("Only plain objects can be passed to
 * Client Components…", logged on every render). No screen reads it, so it
 * travels as a number. For the web pages only: `listOrders` itself is left
 * alone, because `/api/v1` serialises the same field for the app.
 */
export function withPlainGstRate<I extends { gstRate: { toString(): string } | number | null }, O extends { items: I[] }>(
  order: O
): Omit<O, "items"> & { items: (Omit<I, "gstRate"> & { gstRate: number | null })[] } {
  return {
    ...order,
    items: order.items.map((i) => ({ ...i, gstRate: i.gstRate === null ? null : Number(i.gstRate) })),
  };
}
