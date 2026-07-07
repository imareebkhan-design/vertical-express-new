"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getOtpProvider } from "@/lib/services/auth-provider";
import { ensureUserMirror } from "@/lib/services/users";
import { mergeGuestCart } from "@/lib/services/cart-merge";
import { createSupabaseServer } from "@/lib/supabase/server";
import { phoneSchema, type ActionResult, fail, succeed } from "@/lib/validators";

const ANON_CART_COOKIE = "ve_anon_cart";

const identifierSchema = z.union([
  z.string().email("Enter a valid email address"),
  phoneSchema,
]);

/** Step 1: send a one-time code / login link to the identifier. */
export async function sendOtp(rawIdentifier: string): Promise<ActionResult<{ channel: string }>> {
  const parsed = identifierSchema.safeParse(rawIdentifier.trim().toLowerCase());
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input", "identifier");
  }

  const provider = getOtpProvider();
  const result = await provider.send(parsed.data);
  if (!result.ok) {
    // Supabase rate-limit messages are user-safe
    return fail("RATE_LIMITED", result.message ?? "Could not send code. Try again shortly.");
  }
  return succeed({ channel: provider.channel });
}

/** Step 2: verify the code, establish the session, mirror the user, merge guest cart. */
export async function verifyOtp(
  rawIdentifier: string,
  token: string
): Promise<ActionResult<{ userId: string }>> {
  const parsed = identifierSchema.safeParse(rawIdentifier.trim().toLowerCase());
  if (!parsed.success) return fail("VALIDATION", "Invalid identifier", "identifier");
  if (!/^[A-Za-z0-9]{6,12}$/.test(token.trim())) {
    return fail("VALIDATION", "Enter the 6-digit code", "token");
  }

  const provider = getOtpProvider();
  const result = await provider.verify(parsed.data, token.trim());
  if (!result.ok || !result.userId) {
    return fail("UNAUTHENTICATED", result.message ?? "Invalid or expired code", "token");
  }

  await ensureUserMirror({ userId: result.userId, email: result.email, phone: result.phone });

  const cookieStore = await cookies();
  const anonId = cookieStore.get(ANON_CART_COOKIE)?.value ?? null;
  await mergeGuestCart(result.userId, anonId);
  if (anonId) cookieStore.delete(ANON_CART_COOKIE);

  revalidatePath("/", "layout");
  return succeed({ userId: result.userId });
}

export async function signOut(): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return succeed(null);
}
