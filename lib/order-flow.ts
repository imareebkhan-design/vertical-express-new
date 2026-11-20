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

/**
 * Fulfilment moves an admin may NOT make by hand once the order has
 * shipments: packing, dispatch and delivery happen on the shipments (the
 * dispatch board), which enforce driver assignment and the customer's delivery
 * code, and the order follows them (lib/services/order-rollup.ts). Setting the
 * order to "delivered" by hand would skip the code entirely.
 */
export const SHIPMENT_DRIVEN: readonly OrderStatus[] = ["packed", "out_for_delivery", "delivered"];

/**
 * States an OPERATOR may still cancel from, although the machine has no such
 * edge: an order that was packed or sent out and whose goods are all back in
 * the warehouse — every shipment received back (`receiveShipmentBack`) or
 * cancelled.
 *
 * Without this a failed delivery was a dead end. The shipment could be received
 * back or cancelled, but the order stayed `packed` / `out_for_delivery` for
 * ever: it could not be cancelled, so the payment was never owed back
 * (`refundEligibility` needs a dead order) and the customer's money could not
 * be returned from the console.
 *
 * Deliberately not an ORDER_FLOW edge. `isCancellable` is derived from the map
 * and is what the customer's cancel uses; a customer still cannot cancel after
 * packing. The condition that no goods are outside the warehouse is not known
 * here — `advanceOrderStatus` checks it inside the cancel transaction
 * (`hasDispatchedShipment`), and a delivered shipment also refuses, so a
 * part-delivered order is never cancelled whole.
 */
export const OPERATOR_RECOVERABLE: readonly OrderStatus[] = ["packed", "out_for_delivery"];

/** Whether an operator may cancel from here, given where the goods are. */
export function canOperatorCancel(current: OrderStatus, goodsOutsideWarehouse: boolean): boolean {
  if (isCancellable(current)) return true;
  return OPERATOR_RECOVERABLE.includes(current) && !goodsOutsideWarehouse;
}

/**
 * The moves the order screen may offer by hand.
 *
 * `goodsOutsideWarehouse` — any shipment out for delivery or delivered.
 * Defaults to true, the answer that offers nothing extra.
 */
export function manualOrderMoves(current: OrderStatus, hasLiveShipments: boolean, goodsOutsideWarehouse = true): OrderStatus[] {
  const next = nextOrderStatuses(current);
  const moves = hasLiveShipments ? next.filter((s) => !SHIPMENT_DRIVEN.includes(s)) : next;
  if (!moves.includes("cancelled") && canOperatorCancel(current, goodsOutsideWarehouse)) return [...moves, "cancelled"];
  return moves;
}

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
 * matches the state of the system: since 19 Oct an operator can refund money
 * that was never owed (a capture on a cancelled order, a second capture), but
 * that is recorded on the payment (`payment_refunds`, lib/services/refunds.ts)
 * and never moves the order; refunds of delivered goods wait for policy (ISS-025).
 *
 * Left as-is deliberately. Adding an edge would make the machine claim a
 * capability the application does not have, and the refund policy — window,
 * who may authorise, what happens to a COD order — is the owner's to set.
 * Recorded here so the gap is visible where the rule lives.
 */
export const REFUND_UNREACHABLE = true;
