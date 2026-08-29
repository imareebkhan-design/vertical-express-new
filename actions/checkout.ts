"use server";

import { revalidatePath } from "next/cache";
import { getAuthUserId } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/services/cart";
import {
  computeTotals,
  placeOrder as placeOrderService,
  markOrderPaid,
  type CheckoutTotals,
} from "@/lib/services/checkout";
import { activeGateway, verifyRazorpaySignature, type PaymentMethodId } from "@/lib/services/payments";
import { getOrderByNo } from "@/lib/services/orders";
import { sendOrderConfirmationEmail } from "@/lib/services/email";
import { createSupabaseServer } from "@/lib/supabase/server";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/** Fire the order-confirmation email for a freshly-confirmed order (P1-1). */
async function emailOrderConfirmation(userId: string, orderNo: string, toEmail: string | null) {
  if (!toEmail) return;
  const order = await getOrderByNo(userId, orderNo);
  if (!order || order.status === "pending_payment") return;
  const addr = order.address as { name?: string } | null;
  await sendOrderConfirmationEmail(toEmail, {
    orderNo: order.orderNo,
    paymentMethod: order.paymentMethod,
    items: order.items.map((i) => ({ title: i.title, qty: i.qty, lineTotalPaise: i.lineTotalPaise })),
    subtotalPaise: order.subtotalPaise,
    taxPaise: order.taxPaise,
    deliveryFeePaise: order.deliveryFeePaise,
    totalPaise: order.totalPaise,
    etaMinutes: order.etaMinutes,
    customerName: addr?.name ?? null,
  });
}

/** Live totals for a chosen delivery pincode (delivery fee, ETA, serviceability, optional coupon). */
export async function getCheckoutTotals(pincode: string, couponCode?: string): Promise<ActionResult<CheckoutTotals>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to checkout");
  const cart = await getCartSummary(userId, null);
  if (cart.lines.length === 0) return fail("CONFLICT", "Your cart is empty");
  return succeed(await computeTotals(cart, pincode, null, couponCode));
}

/** Validate a coupon code against current user cart. */
export async function validateCoupon(code: string, pincode: string): Promise<ActionResult<CheckoutTotals>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to use coupons");
  const cart = await getCartSummary(userId, null);
  if (cart.lines.length === 0) return fail("CONFLICT", "Your cart is empty");
  const totals = await computeTotals(cart, pincode, null, code);
  if (totals.discountPaise === 0 && totals.deliveryFeePaise !== 0) {
    return fail("VALIDATION", "Invalid or applicable conditions not met for this coupon");
  }
  return succeed(totals);
}

interface PlaceOrderData {
  orderNo: string;
  razorpay: { orderId: string; amountPaise: number; keyId: string } | null;
}

export async function placeOrder(input: {
  addressId: string;
  paymentMethod: "online" | "cod";
  notes?: string;
  idempotencyKey?: string;
  /** Re-validated server-side; the client's discount figure is never trusted. */
  couponCode?: string | null;
}): Promise<ActionResult<PlaceOrderData>> {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to checkout");
  const userEmail = authData.user?.email ?? null;

  // "online" maps to whichever gateway is active (dummy now, razorpay later).
  const method: PaymentMethodId = input.paymentMethod === "cod" ? "cod" : activeGateway();

  try {
    const result = await placeOrderService({
      userId,
      addressId: input.addressId,
      paymentMethod: method,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      couponCode: input.couponCode,
    });
    revalidatePath("/cart");
    revalidatePath("/account/orders");

    // P1-1: order-confirmation email for immediately-confirmed orders (COD/dummy).
    // Pending-payment (Razorpay) orders are emailed after payment is verified.
    if (!result.requiresPaymentConfirmation) {
      await emailOrderConfirmation(userId, result.orderNo, userEmail);
    }
    return succeed({
      orderNo: result.orderNo,
      // Razorpay checkout inputs (present only when the online gateway is active
      // and the order awaits payment). Dummy/COD → null, client skips the modal.
      razorpay:
        result.requiresPaymentConfirmation && result.gatewayOrderId
          ? {
              orderId: result.gatewayOrderId,
              amountPaise: result.amountPaise ?? 0,
              keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
            }
          : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not place order";
    if (msg.startsWith("OUT_OF_STOCK:")) {
      return fail("OUT_OF_STOCK", `${msg.split(":")[1]} is out of stock`);
    }
    if (msg === "PINCODE_UNSERVICEABLE") return fail("PINCODE_UNSERVICEABLE", "This pincode isn't serviceable");
    if (msg === "COD_UNAVAILABLE") return fail("CONFLICT", "Pay on delivery isn't available here");
    if (msg === "CART_EMPTY") return fail("CONFLICT", "Your cart is empty");
    if (msg === "ADDRESS_NOT_FOUND") return fail("NOT_FOUND", "Select a valid delivery address");
    return fail("PAYMENT_FAILED", "Something went wrong placing your order");
  }
}

/** Verify the Razorpay Checkout callback and confirm the order (P0-2). */
export async function confirmRazorpayPayment(input: {
  orderNo: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<ActionResult<{ orderNo: string }>> {
  const supabase = await createSupabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");

  const valid = verifyRazorpaySignature({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    signature: input.signature,
  });
  if (!valid) return fail("PAYMENT_FAILED", "Payment could not be verified");

  const res = await markOrderPaid({
    orderNo: input.orderNo,
    userId,
    gatewayPaymentId: input.razorpayPaymentId,
  });
  if (!res.ok) return fail("NOT_FOUND", "Order not found");
  await emailOrderConfirmation(userId, input.orderNo, authData.user?.email ?? null);
  return succeed({ orderNo: input.orderNo });
}
