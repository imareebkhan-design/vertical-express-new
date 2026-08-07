"use server";

import { revalidatePath } from "next/cache";
import { getAuthUserId } from "@/lib/supabase/server";
import { cancelOrder as cancelService, reorder as reorderService, getOrderByNo } from "@/lib/services/orders";
import { type ActionResult, fail, succeed } from "@/lib/validators";

export async function cancelOrder(orderNo: string, reason: string): Promise<ActionResult<null>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");
  try {
    await cancelService(userId, orderNo, reason || "Cancelled by customer");
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${orderNo}`);
    return succeed(null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_CANCELLABLE") return fail("CONFLICT", "This order can no longer be cancelled");
    return fail("NOT_FOUND", "Order not found");
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
