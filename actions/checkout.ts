"use server";

import { revalidatePath } from "next/cache";
import { getAuthUserId } from "@/lib/supabase/server";
import { getCartSummary } from "@/lib/services/cart";
import { computeTotals, placeOrder as placeOrderService, type CheckoutTotals } from "@/lib/services/checkout";
import { activeGateway, type PaymentMethodId } from "@/lib/services/payments";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/** Live totals for a chosen delivery pincode (delivery fee, ETA, serviceability). */
export async function getCheckoutTotals(pincode: string): Promise<ActionResult<CheckoutTotals>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to checkout");
  const cart = await getCartSummary(userId, null);
  if (cart.lines.length === 0) return fail("CONFLICT", "Your cart is empty");
  return succeed(await computeTotals(cart, pincode));
}

export async function placeOrder(input: {
  addressId: string;
  paymentMethod: "online" | "cod";
  notes?: string;
  idempotencyKey?: string;
}): Promise<ActionResult<{ orderNo: string }>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to checkout");

  // "online" maps to whichever gateway is active (dummy now, razorpay later).
  const method: PaymentMethodId = input.paymentMethod === "cod" ? "cod" : activeGateway();

  try {
    const result = await placeOrderService({
      userId,
      addressId: input.addressId,
      paymentMethod: method,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath("/cart");
    revalidatePath("/account/orders");
    return succeed({ orderNo: result.orderNo });
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
