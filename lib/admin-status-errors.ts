import type { ActionErrorCode } from "@/lib/validators";

/**
 * What an operator is told when a status change is refused.
 *
 * `advanceOrderStatus` and `advanceBookingStatus` refuse by throwing a short
 * code. This maps each code to the sentence the console shows, in one place,
 * so the wording can be tested: the console used to show a bare "!" for all of
 * them, and anything unrecognised was reported as "Order not found".
 *
 * Returns null for a code that is not a known refusal — an unexpected fault,
 * which the caller reports as such instead of guessing.
 */
export type StatusRefusal = {
  code: ActionErrorCode;
  message: string;
  /** The refusal itself changed what is stored, so lists must be re-read. */
  changedSomething?: boolean;
};

const ORDER: Record<string, StatusRefusal> = {
  NOT_FOUND: { code: "NOT_FOUND", message: "Order not found" },
  INVALID_TRANSITION: { code: "CONFLICT", message: "That status change isn't allowed" },
  STATUS_CHANGED: { code: "CONFLICT", message: "This order changed while you were looking at it. Reload and try again." },
  SHIPMENT_DISPATCHED: { code: "CONFLICT", message: "Part of this order has already left the warehouse. Handle the shipment on the dispatch board instead." },
  USE_DISPATCH: { code: "CONFLICT", message: "Packing, dispatch and delivery are done on the dispatch board for this order — delivery needs the customer's code." },
  PAYMENT_REQUIRED: { code: "CONFLICT", message: "An online order is confirmed by its payment, not by hand." },
  PAYMENT_FOUND: {
    code: "CONFLICT",
    message: "Razorpay shows this order was paid, so it was not cancelled. Reload to see it. To cancel a paid order, cancel it again and refund it from Payments.",
    changedSomething: true,
  },
  PAYMENT_IN_PROGRESS: { code: "CONFLICT", message: "A payment for this order is in progress at Razorpay. Wait a few minutes and try again." },
  PAYMENT_STATUS_UNKNOWN: { code: "CONFLICT", message: "Razorpay could not be asked whether this order was paid, so it was not cancelled. Try again in a few minutes." },
};

const BOOKING: Record<string, StatusRefusal> = {
  NOT_FOUND: { code: "NOT_FOUND", message: "Booking not found" },
  INVALID_TRANSITION: { code: "CONFLICT", message: "That status change isn't allowed" },
};

export function orderStatusRefusal(thrown: unknown): StatusRefusal | null {
  return thrown instanceof Error ? (ORDER[thrown.message] ?? null) : null;
}

export function bookingStatusRefusal(thrown: unknown): StatusRefusal | null {
  return thrown instanceof Error ? (BOOKING[thrown.message] ?? null) : null;
}

/**
 * For a fault that is not a refusal. Some steps run after the status is saved
 * (cashback, the customer notification), so the status may have changed: the
 * message says so rather than claim it did not.
 */
export const STATUS_FAULT: StatusRefusal = {
  code: "UNAVAILABLE",
  message: "Something went wrong while changing the status. Reload to see whether it changed before trying again.",
  changedSomething: true,
};
