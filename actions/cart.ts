"use server";

import { cookies, headers } from "next/headers";
import { randomUUID } from "crypto";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  addItem,
  updateItemQty,
  removeItem,
  getCartSummary,
  type CartSummary,
  type UpdateCartQtyResult,
} from "@/lib/services/cart";
import { cartItemInputSchema, type ActionResult, fail, succeed } from "@/lib/validators";
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
      const errorMsg = error instanceof Error ? error.message : "";
      if (errorMsg.startsWith("OUT_OF_STOCK") || errorMsg.startsWith("ONLY_X_LEFT")) {
        const parts = errorMsg.split(":");
        const code = parts[0] as "OUT_OF_STOCK" | "ONLY_X_LEFT";
        const message = parts[1] || "Not enough stock";
        
        let available = 0;
        let requested = parsed.data.qty;
        if (code === "ONLY_X_LEFT") {
          const availMatch = message.match(/Only (\d+) items/i);
          if (availMatch) available = parseInt(availMatch[1], 10);
          const reqMatch = message.match(/Requested: (\d+)/i);
          if (reqMatch) requested = parseInt(reqMatch[1], 10);
        }

        return fail(
          code,
          message,
          undefined,
          {
            status: code === "OUT_OF_STOCK" ? "out_of_stock" : "limited",
            available,
            requested,
            message,
          }
        );
      }
      return fail("NOT_FOUND", "This product is unavailable");
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
