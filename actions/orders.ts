"use server";

import { revalidatePath } from "next/cache";
import { getAuthUserId } from "@/lib/auth/current-user";
import {
  cancelOrder as cancelService,
  reorder as reorderService,
  getOrderByNo,
  reconcileWithGateway,
} from "@/lib/services/orders";
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
  } catch {
    return fail("NOT_FOUND", "Order not found");
  }
}

export async function retryOrderPayment(orderNo: string): Promise<ActionResult<{
  orderNo: string;
  razorpay: { orderId: string; amountPaise: number; keyId: string } | null;
}>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");

  const order = await getOrderByNo(userId, orderNo);
  if (!order) return fail("NOT_FOUND", "Order not found");
  if (order.status !== "pending_payment") {
    return fail("CONFLICT", "This order is not awaiting payment");
  }

  /* E5: the first payment may have gone through with its confirmation lost
     (browser closed, network dropped) and its webhook not yet here. Ask
     Razorpay before offering the checkout again. */
  const check = await reconcileWithGateway(order, { context: "retry" });
  if (check === "settled") {
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderNo}`);
    /* No checkout details: the screen refreshes and shows the paid order. */
    return succeed({ orderNo: order.orderNo, razorpay: null });
  }
  if (check === "late") return fail("CONFLICT", LATE_PAYMENT_MESSAGE);
  if (check === "authorized") {
    return fail(
      "UNAVAILABLE",
      "Your bank has approved a payment for this order and it is still being completed. Please don't pay again — check back in a few minutes."
    );
  }
  if (check === "unknown") {
    return fail(
      "UNAVAILABLE",
      "We couldn't confirm this payment with the bank just now. If you've already paid, please don't pay again — check back in a few minutes."
    );
  }

  const payment = order.payments[0];
  const gatewayOrderId = payment?.gatewayOrderId ?? null;

  return succeed({
    orderNo: order.orderNo,
    razorpay: gatewayOrderId
      ? {
          orderId: gatewayOrderId,
          amountPaise: order.totalPaise,
          keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
        }
      : null,
  });
}
