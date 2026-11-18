/**
 * What an operator is told after pressing "Check payment" on an order that is
 * awaiting payment (roadmap B-4). Pure, so the wording is tested without a
 * database and the screen and the server action cannot drift apart.
 *
 * Every message says whether anything changed. The check can confirm an order
 * (Razorpay has the money) and can change nothing else: it never cancels,
 * never restocks, and never marks anything paid by hand.
 */

export type AdminPaymentCheckResult =
  /** Razorpay had captured the money; the order is now confirmed. */
  | "paid"
  /** Razorpay had the money, but the order had already closed: recorded for refund review. */
  | "late"
  /** Razorpay has no captured payment for the order. */
  | "not_captured"
  /** The bank approved it but Razorpay has not captured it yet. */
  | "in_progress"
  /** Razorpay did not answer, or reported a different amount. */
  | "unknown"
  /** This server has no Razorpay keys, so it cannot ask. */
  | "unconfigured"
  /** The order is not awaiting payment any more. */
  | "not_pending"
  /** Nothing to ask about: cash on delivery, or no Razorpay order was created. */
  | "no_gateway_order";

export interface AdminPaymentCheckMessage {
  tone: "ok" | "info" | "warn" | "bad";
  message: string;
  /** True when the order changed, so the page must be re-read. */
  changed: boolean;
}

const MESSAGES: Record<AdminPaymentCheckResult, AdminPaymentCheckMessage> = {
  paid: {
    tone: "ok",
    changed: true,
    message: "Razorpay has the payment. The order is now confirmed.",
  },
  late: {
    tone: "warn",
    changed: true,
    message:
      "Razorpay has the payment, but this order had already closed. The payment is recorded for refund review on Payments; the order was not reopened.",
  },
  not_captured: {
    tone: "info",
    changed: false,
    message: "Razorpay has no captured payment for this order. Nothing was changed.",
  },
  in_progress: {
    tone: "warn",
    changed: false,
    message:
      "The bank has approved the payment but Razorpay has not captured it yet. Nothing was changed. Check again in a few minutes; do not ask the customer to pay again.",
  },
  unknown: {
    tone: "bad",
    changed: false,
    message:
      "Razorpay did not give a clear answer (no response, or a different amount from this order's). Nothing was changed, and an alert was raised. Try again in a few minutes.",
  },
  unconfigured: {
    tone: "bad",
    changed: false,
    message: "Razorpay is not set up on this server, so the payment cannot be checked here. Nothing was changed.",
  },
  not_pending: {
    tone: "info",
    changed: true,
    message: "This order is no longer awaiting payment. Nothing was checked; the page has been refreshed.",
  },
  no_gateway_order: {
    tone: "info",
    changed: false,
    message: "This order has no Razorpay payment to check (cash on delivery, or no online payment was started).",
  },
};

export function adminPaymentCheckMessage(result: AdminPaymentCheckResult): AdminPaymentCheckMessage {
  return MESSAGES[result];
}

/**
 * Whether the button belongs on the page: an order awaiting payment that has a
 * Razorpay order not yet recorded as captured. Mirrors what the server asks
 * about, so the button is not offered where the answer would only be
 * "nothing to check".
 */
export function canCheckPayment(order: {
  status: string;
  payments: { gateway: string; gatewayOrderId: string | null; status: string }[];
}): boolean {
  return (
    order.status === "pending_payment" &&
    order.payments.some((p) => p.gateway === "razorpay" && p.gatewayOrderId !== null && p.status !== "captured")
  );
}
