/**
 * How long an online order waits for its payment, and how the Razorpay window
 * is held inside that.
 *
 * The expiry job cancels a `pending_payment` order once it is older than the
 * window (lib/services/orders.ts). Razorpay's own Checkout has no idea of that
 * deadline: left open, it took a TEST payment on 8 Oct 2026 fifteen minutes
 * after the order had been cancelled — the money recorded, the order dead, a
 * refund owed. So every Checkout is opened with a `timeout` that closes it a
 * margin before the order can expire, and is not opened at all when too little
 * of the window is left to pay in.
 *
 * Import-free: the server, the web client and the app all read it.
 */

/** Minutes an online order may stay unpaid before the expiry job cancels it. */
export const PAYMENT_WINDOW_MINUTES = 15;

/** Checkout closes this long before the order can expire, so a payment cannot finish after it. */
export const CHECKOUT_MARGIN_SECONDS = 60;

/** Below this, opening Checkout would only let the customer start a payment they cannot finish. */
export const CHECKOUT_MIN_SECONDS = 60;

/** When the order stops accepting payment, as sent to clients with the Razorpay order. */
export function payByFor(placedAt: Date): string {
  return new Date(placedAt.getTime() + PAYMENT_WINDOW_MINUTES * 60_000).toISOString();
}

/**
 * The payment terms a Razorpay payload carries. `payWithinSeconds` is counted
 * on the server's clock at the moment of the response, so a phone whose clock
 * is wrong still gets the right timeout; `payBy` is kept for display and for
 * clients that predate it.
 */
export interface PaymentTerms {
  payBy: string;
  payWithinSeconds: number;
}

export function paymentTermsFor(placedAt: Date, nowMs: number = Date.now()): PaymentTerms {
  const until = placedAt.getTime() + PAYMENT_WINDOW_MINUTES * 60_000;
  return { payBy: new Date(until).toISOString(), payWithinSeconds: Math.floor((until - nowMs) / 1000) };
}

/**
 * Razorpay Checkout's `timeout`, in whole seconds. `"closed"` when too little
 * of the window is left to open Checkout; `null` when the server sent no terms
 * (an older server), in which case the caller opens Checkout as it always did.
 *
 * Prefers `payWithinSeconds` (server clock, immune to a wrong device clock);
 * falls back to `payBy` against this device's clock. Rounds down, and keeps a
 * margin, so Checkout always closes before the order can expire.
 */
export function checkoutTimeoutSeconds(
  terms: { payBy?: string | null; payWithinSeconds?: number | null } | null | undefined,
  nowMs: number = Date.now()
): number | "closed" | null {
  let left: number | null = null;
  if (typeof terms?.payWithinSeconds === "number" && Number.isFinite(terms.payWithinSeconds)) {
    left = Math.floor(terms.payWithinSeconds);
  } else if (terms?.payBy) {
    const until = Date.parse(terms.payBy);
    if (!Number.isNaN(until)) left = Math.floor((until - nowMs) / 1000);
  }
  if (left === null) return null;
  const seconds = left - CHECKOUT_MARGIN_SECONDS;
  return seconds < CHECKOUT_MIN_SECONDS ? "closed" : seconds;
}

/** What the customer is told instead of a Checkout that could not finish in time. */
export const PAYMENT_WINDOW_CLOSED_MESSAGE =
  "The time to pay for this order has run out, so it will be cancelled and nothing will be charged. Please place a new order.";

/**
 * What the customer is told when they close the Razorpay window. Closing it is
 * not proof that nothing was paid — a UPI app or bank page can take the money
 * and leave the window open (seen on iOS, 10 Oct). So no "you have not been
 * charged": the order is saved, and paying again from it is safe because every
 * retry path asks Razorpay first (retryOrderPayment / GET /api/v1/orders/:no).
 */
export const PAYMENT_DISMISSED_MESSAGE =
  "Payment window closed. Your order is saved. If money already left your account, do not pay again — it will show on this order within a few minutes. Otherwise you can complete payment from the order.";

/** What the customer is told when their payment lands on an expired order — at payment time and on the order page. */
export const LATE_PAYMENT_MESSAGE =
  "This order expired before your payment completed. Your payment has been recorded and will be reviewed for a refund. Please do not pay again.";

/**
 * A cancelled order whose payment was captured anyway: the customer has paid
 * for nothing and is owed a refund. The order page must say so — "cancelled"
 * beside "Paid online" reads as either a glitch or a lost ₹.
 */
export function isLatePaid(order: { status: string; payments?: { status: string }[] | null }): boolean {
  return order.status === "cancelled" && order.payments?.[0]?.status === "captured";
}
