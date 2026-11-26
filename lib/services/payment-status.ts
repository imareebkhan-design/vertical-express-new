import "server-only";
import { db } from "@/lib/db";
import { getOrderByNo, reconcileWithGateway, type GatewayCheck, type OrderWithDetails } from "@/lib/services/orders";
import type { PlaceOrderResult } from "@/lib/services/checkout";
import { getPaymentProvider, type CapturedLookup } from "@/lib/services/payments";
import { checkoutTimeoutSeconds, paymentTermsFor } from "@/lib/payment-window";

/**
 * What a customer may be told about an online payment — one answer for the web,
 * the mobile web and the apps, decided on the server.
 *
 *   paid     the order is confirmed (or onward). Settled by the webhook, the
 *            callback, or by this check finding the capture at Razorpay.
 *   late     money was captured after the order expired: recorded for refund
 *            review (the existing late-payment policy). Never "pay again".
 *   pending  cannot be established yet: the bank approved but capture is
 *            pending, a payment attempt is still in flight (e.g. a UPI request
 *            awaiting approval), or Razorpay could not be asked. The customer is
 *            told to wait and NOT pay again; checkout is NOT offered.
 *   failed   every attempt Razorpay knows of failed and none is in flight.
 *   unpaid   Razorpay has no attempt on the order at all.
 *   expired  the order (or its payment window) closed with no payment found.
 *
 * `canPay` is the only switch any client may use to open Checkout: true only for
 * failed or unpaid, while the payment window is open. Every retry path (web
 * Pay now, app Complete payment, web Place-order replay) goes through here, so
 * an attempt that may still take money is never followed by a second one.
 */
export type PaymentState = "paid" | "late" | "pending" | "failed" | "unpaid" | "expired";

export interface PaymentStatusView {
  orderNo: string;
  orderStatus: string;
  state: PaymentState;
  canPay: boolean;
  /** What Razorpay answered when this view asked it (absent when it was not asked).
   *  Lets a caller tell "approved, capture pending" and "could not ask" apart from
   *  "nothing captured" — `state` says `pending` for all three. Additive. */
  gateway?: GatewayCheck;
}

export interface PaymentStatusDeps {
  findCaptured?: (gatewayOrderId: string) => Promise<CapturedLookup | null>;
  listAttempts?: (gatewayOrderId: string, callbackPaymentIds: string[]) => Promise<string[]>;
}

const PAID = new Set(["confirmed", "packed", "out_for_delivery", "delivered"]);

const view = (order: { orderNo: string }, orderStatus: string, state: PaymentState, gateway?: GatewayCheck): PaymentStatusView => ({
  orderNo: order.orderNo,
  orderStatus,
  state,
  canPay: state === "failed" || state === "unpaid",
  ...(gateway ? { gateway } : {}),
});

function fromClosedOrder(order: { orderNo: string; status: string; payments: { status: string }[] }): PaymentStatusView {
  const captured = order.payments.some((p) => p.status === "captured" || p.status === "refunded");
  if (PAID.has(order.status)) return view(order, order.status, "paid");
  if (order.status === "refund_initiated" || order.status === "refunded" || captured) {
    return view(order, order.status, "late");
  }
  return view(order, order.status, "expired");
}

/** The authoritative payment state of an order the caller already owns (load it with getOrderByNo). */
export async function paymentStatusFor(order: OrderWithDetails, deps: PaymentStatusDeps = {}): Promise<PaymentStatusView> {
  if (order.status !== "pending_payment") return fromClosedOrder(order);

  const payment = order.payments[0];
  if (!payment || payment.gateway !== "razorpay" || !payment.gatewayOrderId) {
    /* Pending with no Razorpay order to ask about: nothing can be verified. */
    return view(order, order.status, "pending");
  }

  const check = await reconcileWithGateway(order, { context: "status", findCaptured: deps.findCaptured });
  if (check === "settled" || check === "late") {
    const now = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
    const status = now?.status ?? order.status;
    return view(order, status, check === "late" || !PAID.has(status) ? "late" : "paid", check);
  }
  let state: PaymentState = "pending";
  /* The order was loaded before either network call. A signed callback may
     have been recorded since, so the attempt list is checked against the IDs
     as they stand now, and the decision below against the same list. */
  let known = payment.callbackPaymentIds;
  if (check === "not_captured") {
    known = (await db.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { callbackPaymentIds: true } }))
      .callbackPaymentIds;
    const listAttempts = deps.listAttempts ?? ((gw, ids) => getPaymentProvider("razorpay").listPaymentAttempts(gw, ids));
    try {
      const attempts = await listAttempts(payment.gatewayOrderId, known);
      if (attempts.every((attempt) => attempt === "failed")) {
        if (checkoutTimeoutSeconds(paymentTermsFor(order.placedAt)) === "closed") state = "expired";
        else state = attempts.length ? "failed" : "unpaid";
      }
    } catch {
      // An incomplete or unavailable list leaves the payment pending.
    }
  }

  // A webhook or a new signed attempt may have committed during either network call.
  const latest = await db.payment.findUniqueOrThrow({
    where: { id: payment.id },
    select: {
      callbackPaymentIds: true,
      order: { select: { orderNo: true, status: true, payments: { select: { status: true } } } },
    },
  });
  if (latest.order.status !== "pending_payment") return fromClosedOrder(latest.order);
  const unchanged =
    latest.callbackPaymentIds.length === known.length && latest.callbackPaymentIds.every((id) => known.includes(id));
  if (!unchanged) return view(order, order.status, "pending", check);
  return view(order, order.status, state, check);
}

/**
 * A replayed place-order (same idempotency key: double click, refresh, lost
 * response) used to hand the Razorpay order back without asking Razorpay, so a
 * client could open Checkout on an order whose first payment was approved or
 * still in flight. Replays are now gated like every other retry: Checkout
 * details only when `canPay`. A fresh order is passed through untouched (it has
 * no attempts yet, and asking Razorpay would only slow checkout down).
 */
export async function gatePlaceOrderReplay(
  userId: string,
  result: PlaceOrderResult,
  deps: PaymentStatusDeps = {}
): Promise<PlaceOrderResult & { paymentState?: PaymentState }> {
  if (!result.replayed || !result.requiresPaymentConfirmation || !result.gatewayOrderId) return result;
  const order = await getOrderByNo(userId, result.orderNo);
  if (!order) return result;
  const status = await paymentStatusFor(order, deps);
  if (status.canPay) return { ...result, paymentState: status.state };
  return {
    ...result,
    status: status.orderStatus,
    requiresPaymentConfirmation: status.orderStatus === "pending_payment",
    gatewayOrderId: null,
    paymentState: status.state,
  };
}
