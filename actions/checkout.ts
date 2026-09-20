"use server";

import { revalidatePath } from "next/cache";
import { getAuthUserId, getAuthUser } from "@/lib/auth/current-user";
import { getCartSummary } from "@/lib/services/cart";
import { resolveCoupon, refusalMessage } from "@/lib/services/coupon-eligibility";
import {
  computeTotals,
  placeOrder as placeOrderService,
  confirmOnlinePayment,
  type CheckoutTotals,
} from "@/lib/services/checkout";
import { activeGateway, type PaymentMethodId } from "@/lib/services/payments";
import { classifyPlaceOrderError } from "@/lib/checkout-errors";
import { getOrderByNo } from "@/lib/services/orders";
import { sendOrderConfirmationEmail } from "@/lib/services/email";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * A contact address, or null when there is nothing usable.
 *
 * Deliberately conservative rather than clever: no attempt to correct a typo,
 * because guessing that "gmial" meant "gmail" sends somebody's receipt to a
 * stranger. Blank is not an error — the field is optional.
 */
function normaliseContactEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "" || value.length > 254) return null;
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value) ? value : null;
}

/**
 * Fire the order-confirmation email for a freshly-confirmed order (P1-1).
 *
 * The account's email is the fallback, not the source. A phone sign-in carries
 * none — and phone is this market's default identity — so the address the
 * customer typed at checkout is read first. It lives on the order, and it is
 * the only thing that reaches somebody who signed in with a phone number.
 */
async function emailOrderConfirmation(userId: string, orderNo: string, accountEmail: string | null) {
  const order = await getOrderByNo(userId, orderNo);
  if (!order || order.status === "pending_payment") return;
  const addr = order.address as { name?: string; email?: string | null } | null;
  const toEmail = addr?.email ?? accountEmail;
  if (!toEmail) return;
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
export async function getCheckoutTotals(
  pincode: string,
  couponCode?: string,
  /* Requested, not granted — `computeTotals` re-resolves whether express is
     actually on offer. A browser must not be able to name what it pays. */
  wantsExpress = false
): Promise<ActionResult<CheckoutTotals>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to checkout");
  const cart = await getCartSummary(userId, null);
  if (cart.lines.length === 0) return fail("CONFLICT", "Your cart is empty");
  return succeed(await computeTotals(cart, pincode, null, couponCode, userId, wantsExpress));
}

/** Validate a coupon code against current user cart. */
export async function validateCoupon(code: string, pincode: string): Promise<ActionResult<CheckoutTotals>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to use coupons");
  const cart = await getCartSummary(userId, null);
  if (cart.lines.length === 0) return fail("CONFLICT", "Your cart is empty");
  /* Ask the eligibility rules directly rather than inferring failure from a
     zero discount. The old check — "no discount and delivery still charged" —
     could not tell a coupon that does not exist from one this customer has
     already used, so both produced the same shrug. It also misread a valid
     free-delivery coupon on an order that already had free delivery as a
     failure. */
  const decision = await resolveCoupon({
    code,
    subtotalPaise: cart.subtotalPaise,
    userId,
  });
  if (!decision.ok) return fail("VALIDATION", refusalMessage(decision.reason));

  return succeed(await computeTotals(cart, pincode, null, code, userId));
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
  /**
   * Where to send the receipt, offered at checkout when the account has no
   * email of its own. Never written to the user record.
   */
  contactEmail?: string | null;
  /* Requested, not granted — re-resolved server-side. */
  wantsExpress?: boolean;
}): Promise<ActionResult<PlaceOrderData>> {
  const user = await getAuthUser();
  if (!user) return fail("UNAUTHENTICATED", "Please log in to checkout");
  const userId = user.id;
  const userEmail = user.email;

  // "online" maps to whichever gateway is active (dummy now, razorpay later).
  const method: PaymentMethodId = input.paymentMethod === "cod" ? "cod" : activeGateway();

  /* Shape-checked, not merely trimmed. This string is handed to an email
     provider and stored on the order, so a value that is not an address is
     refused rather than kept and silently never delivered to. */
  const contactEmail = normaliseContactEmail(input.contactEmail);
  if (input.contactEmail && contactEmail === null) {
    return fail("VALIDATION", "That email address does not look right", "contactEmail");
  }

  try {
    const result = await placeOrderService({
      userId,
      addressId: input.addressId,
      paymentMethod: method,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      couponCode: input.couponCode,
      contactEmail,
      wantsExpress: input.wantsExpress,
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
    return classifyPlaceOrderError<PlaceOrderData>(e);
  }
}

/** Verify the Razorpay Checkout callback and confirm the order (P0-2). */
export async function confirmRazorpayPayment(input: {
  orderNo: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<ActionResult<{ orderNo: string }>> {
  const user = await getAuthUser();
  if (!user) return fail("UNAUTHENTICATED", "Please log in");
  const userId = user.id;

  const res = await confirmOnlinePayment({
    userId,
    orderNo: input.orderNo,
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    signature: input.signature,
  });
  if (!res.ok) return fail("PAYMENT_FAILED", "Payment could not be verified");
  await emailOrderConfirmation(userId, input.orderNo, user.email);
  return succeed({ orderNo: input.orderNo });
}
