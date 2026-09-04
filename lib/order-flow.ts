import type { OrderStatus } from "@/prisma/generated/client/client";

/**
 * The order state machine — the only definition of which move is legal.
 *
 * ISS-014 was raised because the admin control wrote any status with no guard:
 * `delivered -> pending_payment` was accepted. That half was fixed —
 * `advanceOrderStatus` refuses an illegal move — but the map stayed inside
 * `lib/services/admin/manage.ts`, and the three other paths that write a status
 * each re-implemented the rule inline:
 *
 *   lib/services/orders.ts       `["pending_payment", "confirmed"].includes(...)`
 *   lib/services/checkout.ts     `order.status !== "pending_payment"`
 *   app/api/webhooks/razorpay    `existingPayment.order.status === "pending_payment"`
 *
 * All three agree with the map today. None is derived from it, so any change to
 * the machine silently leaves them behind, and the customer-facing cancel path
 * is the one most likely to be edited by someone reading only that file.
 *
 * Pure and dependency-free so every one of those can import it — the webhook
 * route included, which must not pull in the admin service.
 */

/** Allowed forward transitions. Absent means terminal. */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
  refund_initiated: ["refunded"],
  refunded: [],
};

/** Where an order in this state may go next. */
export function nextOrderStatuses(current: OrderStatus): OrderStatus[] {
  return ORDER_FLOW[current] ?? [];
}

/** Whether this exact move is legal. */
export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return nextOrderStatuses(from).includes(to);
}

/**
 * States a customer may cancel from, derived from the map rather than listed
 * again. Cancelling after dispatch is a driver problem, not a button.
 */
export function isCancellable(current: OrderStatus): boolean {
  return canTransitionOrder(current, "cancelled");
}

/**
 * `refund_initiated` is unreachable.
 *
 * Nothing in ORDER_FLOW leads to it — `delivered` and `cancelled` are both
 * terminal — so `refunded`, whose only route in is through it, is unreachable
 * too. Refunding is therefore impossible through the state machine, which
 * matches the state of the system: there is no refund entity and no workflow
 * (ISS-025), and `refundPayment` calls Razorpay but nothing calls it.
 *
 * Left as-is deliberately. Adding an edge would make the machine claim a
 * capability the application does not have, and the refund policy — window,
 * who may authorise, what happens to a COD order — is the owner's to set.
 * Recorded here so the gap is visible where the rule lives.
 */
export const REFUND_UNREACHABLE = true;
