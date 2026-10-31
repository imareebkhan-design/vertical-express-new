/**
 * How this deployment trades (owner decision, 31 Oct 2026: build a catalogue-
 * and-enquiries mode alongside the transactional one).
 *
 *   transactional — the shop takes orders and payments. The default, and the
 *                   only mode before this file existed; its production payment
 *                   checks are unchanged (`assertPaymentConfig`).
 *   catalogue     — browsing and enquiries only. The server refuses to place an
 *                   order or start a payment, for the website and the app alike.
 *                   Money that already moved is still handled: the Razorpay
 *                   webhook, a payment the customer already made, refunds and
 *                   admin order operations keep working.
 *
 * Set with COMMERCE_MODE. Anything else is refused at boot and treated as
 * closed at runtime: a typo must never open checkout.
 */

export type CommerceMode = "transactional" | "catalogue";

export class CommerceModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceModeError";
  }
}

export function commerceMode(): CommerceMode {
  const value = process.env.COMMERCE_MODE;
  if (value === undefined || value === "") return "transactional";
  if (value === "transactional" || value === "catalogue") return value;
  throw new CommerceModeError(`Invalid COMMERCE_MODE: "${value}" (expected "transactional" or "catalogue").`);
}

/** May this deployment place an order or start a payment? Fails closed. */
export function orderingOpen(): boolean {
  try {
    return commerceMode() === "transactional";
  } catch {
    return false;
  }
}

/** The thrown marker; `classifyPlaceOrderError` turns it into ORDERING_CLOSED. */
export const ORDERING_CLOSED = "ORDERING_CLOSED";

export const ORDERING_CLOSED_MESSAGE =
  "We're not taking orders online yet. Send us an enquiry from the product page and we'll reply with price and availability.";
