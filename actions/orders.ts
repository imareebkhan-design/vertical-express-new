"use server";

import { ORDERING_CLOSED, ORDERING_CLOSED_MESSAGE, orderingOpen } from "@/lib/commerce-mode";
import { paymentTermsFor, PAYMENT_PENDING_MESSAGE, PAYMENT_WINDOW_CLOSED_MESSAGE } from "@/lib/payment-window";
import { revalidatePath } from "next/cache";
import { getAuthUserId } from "@/lib/auth/current-user";
import {
  cancelOrder as cancelService,
  reorder as reorderService,
  getOrderByNo,
} from "@/lib/services/orders";
import { paymentStatusFor, type PaymentStatusView } from "@/lib/services/payment-status";
import { LATE_PAYMENT_MESSAGE } from "@/lib/services/checkout";
import { type ActionResult, fail, succeed } from "@/lib/validators";
import { cancelErrorResult } from "@/lib/order-display";
import { CONTACT } from "@/lib/data";

export async function cancelOrder(orderNo: string, reason: string): Promise<ActionResult<null>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");
  /* The shared service is the authority: it refuses an order with funds
     recorded or held (PAID_NOT_CANCELLABLE) and guards the write against a
     concurrent payment. The screen hides the button for a paid order too, but
     this action is callable without the screen. */
  try {
    await cancelService(userId, orderNo, reason || "Cancelled by customer");
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderNo}`);
    return succeed(null);
  } catch (e) {
    /* The refusal may have settled the order (found paid at Razorpay). */
    revalidatePath(`/account/orders/${orderNo}`);
    const { code, message } = cancelErrorResult(e instanceof Error ? e.message : "", CONTACT.email);
    return fail(code, message);
  }
}

export async function reorder(orderNo: string): Promise<ActionResult<null>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");
  try {
    await reorderService(userId, orderNo);
    revalidatePath("/cart");
    return succeed(null);
  } catch (e) {
    if (e instanceof Error && e.message === ORDERING_CLOSED) return fail(ORDERING_CLOSED, ORDERING_CLOSED_MESSAGE);
    return fail("NOT_FOUND", "Order not found");
  }
}

export async function retryOrderPayment(orderNo: string): Promise<ActionResult<{
  orderNo: string;
  razorpay: { orderId: string; amountPaise: number; keyId: string; payBy: string | null; payWithinSeconds: number | null } | null;
}>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");

  const order = await getOrderByNo(userId, orderNo);
  if (!order) return fail("NOT_FOUND", "Order not found");
  if (order.status !== "pending_payment") {
    return fail("CONFLICT", "This order is not awaiting payment");
  }
  /* Catalogue mode: no new payment attempt. A payment already made is still
     settled by the webhook and "Check payment status"; the unpaid order expires. */
  if (!orderingOpen()) return fail("ORDERING_CLOSED", ORDERING_CLOSED_MESSAGE, undefined, { orderingClosed: true });

  /* E5 + payment safety (10 Oct): ask Razorpay before offering Checkout again.
     Checkout is offered only when the server can establish that nothing was
     paid and nothing is in flight (paymentStatusFor → canPay); an approved,
     in-flight or unverifiable payment is never followed by a second attempt.
     The payment window is part of the same decision ("expired"). */
  const status = await paymentStatusFor(order);
  if (status.state === "paid") {
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderNo}`);
    /* No checkout details: the screen refreshes and shows the paid order. */
    return succeed({ orderNo: order.orderNo, razorpay: null });
  }
  if (status.state === "late") return fail("CONFLICT", LATE_PAYMENT_MESSAGE);
  if (status.state === "pending") return fail("UNAVAILABLE", PAYMENT_PENDING_MESSAGE);
  if (status.state === "expired") return fail("CONFLICT", PAYMENT_WINDOW_CLOSED_MESSAGE);
  const terms = paymentTermsFor(order.placedAt);

  const payment = order.payments[0];
  const gatewayOrderId = payment?.gatewayOrderId ?? null;

  return succeed({
    orderNo: order.orderNo,
    razorpay: gatewayOrderId
      ? {
          orderId: gatewayOrderId,
          amountPaise: order.totalPaise,
          keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
          ...terms,
        }
      : null,
  });
}

/**
 * "Check payment status" — the authoritative answer for one of the customer's
 * own orders (ownership: getOrderByNo scopes by user). Asks Razorpay when the
 * order is still awaiting payment and settles a capture it finds through the
 * same compare-and-set path as the webhook. Safe to call repeatedly.
 */
export async function checkPaymentStatus(orderNo: string): Promise<ActionResult<PaymentStatusView>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");
  const order = await getOrderByNo(userId, orderNo);
  if (!order) return fail("NOT_FOUND", "Order not found");
  const status = await paymentStatusFor(order);
  if (status.state === "paid" || status.state === "late") {
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderNo}`);
  }
  return succeed(status);
}
