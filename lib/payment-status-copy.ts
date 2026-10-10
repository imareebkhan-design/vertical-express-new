import { LATE_PAYMENT_MESSAGE, PAYMENT_PENDING_MESSAGE } from "@/lib/payment-window";

/** Mirrors lib/services/payment-status.ts (client-safe copy of the union). */
export type PaymentStateName = "paid" | "late" | "pending" | "failed" | "unpaid" | "expired";

export interface PaymentStatusCopy {
  tone: "ok" | "wait" | "warn";
  message: string;
  /** "check": offer Check payment status (never Checkout). "pay": Checkout may be offered. */
  action: "none" | "check" | "pay";
}

export const PAYMENT_NOT_COMPLETED_MESSAGE =
  "Payment not completed. Your order is saved — you can pay for it now.";
export const PAYMENT_FAILED_MESSAGE =
  "The payment didn't go through. If your bank deducted money for this attempt, it returns it automatically. You can try again.";
export const ORDER_EXPIRED_MESSAGE =
  "This order expired before a payment was confirmed. If money was deducted, it is recorded and will be reviewed for a refund — please don't pay again. Place a new order to buy these items.";

/**
 * What to show for a server payment state. `null` (the check itself failed or
 * has not answered) is treated exactly like "pending": an unknown is never
 * reported as "not charged" and never followed by Checkout.
 */
export function describePaymentStatus(state: PaymentStateName | null): PaymentStatusCopy {
  switch (state) {
    case "paid":
      return { tone: "ok", message: "Payment received. Your order is confirmed.", action: "none" };
    case "late":
      return { tone: "warn", message: LATE_PAYMENT_MESSAGE, action: "none" };
    case "expired":
      return { tone: "warn", message: ORDER_EXPIRED_MESSAGE, action: "none" };
    case "failed":
      return { tone: "warn", message: PAYMENT_FAILED_MESSAGE, action: "pay" };
    case "unpaid":
      return { tone: "warn", message: PAYMENT_NOT_COMPLETED_MESSAGE, action: "pay" };
    case "pending":
    default:
      return { tone: "wait", message: PAYMENT_PENDING_MESSAGE, action: "check" };
  }
}
