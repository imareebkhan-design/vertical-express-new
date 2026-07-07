"use server";

import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  addItem,
  updateItemQty,
  removeItem,
  getCartSummary,
  type CartSummary,
} from "@/lib/services/cart";
import { cartItemInputSchema, type ActionResult, fail, succeed } from "@/lib/validators";

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

export async function getCart(): Promise<CartSummary> {
  const { userId, anonId } = await resolveContext(false);
  return getCartSummary(userId, anonId);
}

export async function addToCart(input: { variantId: string; qty: number }): Promise<ActionResult<CartSummary>> {
  const parsed = cartItemInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Invalid item");

  const { userId, anonId } = await resolveContext(true);
  try {
    await addItem(userId, anonId, parsed.data.variantId, parsed.data.qty);
  } catch {
    return fail("NOT_FOUND", "This product is unavailable");
  }
  return succeed(await getCartSummary(userId, anonId));
}

export async function updateCartItem(input: { itemId: string; qty: number }): Promise<ActionResult<CartSummary>> {
  const { userId, anonId } = await resolveContext(false);
  await updateItemQty(userId, anonId, input.itemId, input.qty);
  return succeed(await getCartSummary(userId, anonId));
}

export async function removeCartItem(input: { itemId: string }): Promise<ActionResult<CartSummary>> {
  const { userId, anonId } = await resolveContext(false);
  await removeItem(userId, anonId, input.itemId);
  return succeed(await getCartSummary(userId, anonId));
}
