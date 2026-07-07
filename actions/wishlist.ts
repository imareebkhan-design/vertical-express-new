"use server";

import { revalidatePath } from "next/cache";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  toggleWishlist as toggleService,
  getWishlistProductIds,
} from "@/lib/services/wishlist";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/** Product ids in the current user's wishlist (empty for guests). Hydrates hearts client-side. */
export async function getMyWishlistIds(): Promise<string[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  return getWishlistProductIds(userId);
}

/** Toggle a product in the signed-in user's wishlist. */
export async function toggleWishlist(productId: string): Promise<ActionResult<{ added: boolean }>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in to save items");

  const added = await toggleWishlist_(userId, productId);
  revalidatePath("/account/wishlist");
  return succeed({ added });
}

// indirection keeps the service import name clean
async function toggleWishlist_(userId: string, productId: string) {
  return toggleService(userId, productId);
}
