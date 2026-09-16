"use server";

import { cookies, headers } from "next/headers";
import { randomUUID } from "crypto";
import { getAuthUserId } from "@/lib/auth/current-user";
import {
  addItem,
  updateItemQty,
  removeItem,
  getCartSummary,
  type CartSummary,
  type UpdateCartQtyResult,
} from "@/lib/services/cart";
import { cartItemInputSchema, type ActionResult, fail, succeed } from "@/lib/validators";
import { classifyCartError } from "@/lib/cart-errors";
import { runWithContext, trackEvent, MetricsTracker, captureException } from "@/lib/observability";

const ANON_COOKIE = "ve_anon_cart";
const ANON_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Read the guest cart id, creating and persisting one when a guest first acts. */
async function resolveContext(create: boolean): Promise<{ userId: string | null; anonId: string | null }> {
  const userId = await getAuthUserId();
  if (userId) return { userId, anonId: null };

  const cookieStore = await cookies();
  let anonId = cookieStore.get(ANON_COOKIE)?.value ?? null;
  if (!anonId && create) {
    anonId = randomUUID();
    cookieStore.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: ANON_MAX_AGE,
      path: "/",
    });
  }
  return { userId: null, anonId };
}

async function getActionContext() {
  const reqHeaders = await headers();
  const requestId = reqHeaders.get("x-request-id") || `action-${Math.random()}`;
  const userId = await getAuthUserId();
  return { requestId, userId: userId || undefined };
}

export async function getCart(): Promise<CartSummary> {
  const ctx = await getActionContext();
  return runWithContext(ctx, async () => {
    const metric = new MetricsTracker("cart-service");
    try {
      const { userId, anonId } = await resolveContext(false);
      const summary = await getCartSummary(userId, anonId);
      metric.end("get_cart_success");
      return summary;
    } catch (error) {
      captureException(error);
      throw error;
    }
  });
}

export async function addToCart(input: { variantId: string; qty: number }): Promise<ActionResult<CartSummary>> {
  const ctx = await getActionContext();
  return runWithContext(ctx, async () => {
    const metric = new MetricsTracker("cart-service");
    const parsed = cartItemInputSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION", "Invalid item");

    const { userId, anonId } = await resolveContext(true);
    try {
      await addItem(userId, anonId, parsed.data.variantId, parsed.data.qty);
      trackEvent("add_to_cart", { variantId: parsed.data.variantId, qty: parsed.data.qty });
      metric.end("add_to_cart_success");
      return succeed(await getCartSummary(userId, anonId));
    } catch (error: unknown) {
      captureException(error, { input });
      /* Shared with POST /api/v1/cart/items via lib/cart-errors.ts. Both
         surfaces perform the same operation and must refuse it for the same
         reasons with the same numbers; two copies of this block would agree
         only until somebody fixed one of them. */
      return classifyCartError<CartSummary>(error, parsed.data.qty);
    }
  });
}

export async function updateCartItem(input: { itemId: string; qty: number }): Promise<ActionResult<UpdateCartQtyResult>> {
  const ctx = await getActionContext();
  return runWithContext(ctx, async () => {
    const metric = new MetricsTracker("cart-service");
    try {
      const { userId, anonId } = await resolveContext(false);
      const result = await updateItemQty(userId, anonId, input.itemId, input.qty);
      trackEvent("update_quantity", { itemId: input.itemId, qty: input.qty });
      metric.end("update_quantity_success");
      return succeed(result);
    } catch (error) {
      captureException(error, { input });
      return fail("NOT_FOUND", "Could not update item quantity");
    }
  });
}

export async function removeCartItem(input: { itemId: string }): Promise<ActionResult<CartSummary>> {
  const ctx = await getActionContext();
  return runWithContext(ctx, async () => {
    const metric = new MetricsTracker("cart-service");
    try {
      const { userId, anonId } = await resolveContext(false);
      await removeItem(userId, anonId, input.itemId);
      trackEvent("remove_from_cart", { itemId: input.itemId });
      metric.end("remove_from_cart_success");
      return succeed(await getCartSummary(userId, anonId));
    } catch (error) {
      captureException(error, { input });
      return fail("NOT_FOUND", "Could not remove item from cart");
    }
  });
}
