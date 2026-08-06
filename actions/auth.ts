"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureUserMirror } from "@/lib/services/users";
import { mergeGuestCart } from "@/lib/services/cart-merge";
import { rateLimit } from "@/lib/services/rate-limit";
import { createSupabaseServer } from "@/lib/supabase/server";
import { phoneSchema, type ActionResult, fail, succeed } from "@/lib/validators";

const ANON_CART_COOKIE = "ve_anon_cart";

const identifierSchema = z.union([
  z.string().email("Enter a valid email address"),
  phoneSchema,
]);

/** Step 1: send a one-time code / login link to the identifier (detects email vs phone). */
export async function sendOtp(rawIdentifier: string): Promise<ActionResult<{ channel: "email" | "phone" }>> {
  const parsed = identifierSchema.safeParse(rawIdentifier.trim().toLowerCase());
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input", "identifier");
  }

  const value = parsed.data;
  const channel = value.includes("@") ? ("email" as const) : ("phone" as const);
  const formattedIdentifier = channel === "phone" ? `+91${value}` : value;

  // P1-4: throttle OTP sends per identifier — each send triggers a paid email/SMS.
  const limit = await rateLimit(`otp:${formattedIdentifier}`, 5, 15 * 60 * 1000); // 5 per 15 min
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60000);
    return fail("RATE_LIMITED", `Too many attempts. Try again in ${mins} minute${mins > 1 ? "s" : ""}.`);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp(
    channel === "email"
      ? {
          email: formattedIdentifier,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
          },
        }
      : { phone: formattedIdentifier, options: { shouldCreateUser: true } }
  );

  if (error) {
    return fail("RATE_LIMITED", error.message ?? "Could not send code. Try again shortly.");
  }
  return succeed({ channel });
}

/** Step 2: verify the code, establish the session, mirror the user, merge guest cart. */
export async function verifyOtp(
  rawIdentifier: string,
  token: string
): Promise<ActionResult<{ userId: string }>> {
  const parsed = identifierSchema.safeParse(rawIdentifier.trim().toLowerCase());
  if (!parsed.success) return fail("VALIDATION", "Invalid identifier", "identifier");

  const value = parsed.data;
  const channel = value.includes("@") ? ("email" as const) : ("phone" as const);
  const formattedIdentifier = channel === "phone" ? `+91${value}` : value;
  
  if (!/^[A-Za-z0-9]{6,12}$/.test(token.trim())) {
    return fail("VALIDATION", "Enter the 6-digit code", "token");
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.verifyOtp(
    channel === "email"
      ? { email: formattedIdentifier, token, type: "email" }
      : { phone: formattedIdentifier, token, type: "sms" }
  );

  if (error || !data.user) {
    return fail("UNAUTHENTICATED", error?.message ?? "Invalid or expired code", "token");
  }

  await ensureUserMirror({ userId: data.user.id, email: data.user.email ?? null, phone: data.user.phone ?? null });

  const cookieStore = await cookies();
  const anonId = cookieStore.get(ANON_CART_COOKIE)?.value ?? null;
  await mergeGuestCart(data.user.id, anonId);
  if (anonId) cookieStore.delete(ANON_CART_COOKIE);

  revalidatePath("/", "layout");
  return succeed({ userId: data.user.id });
}

export async function signOut(): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return succeed(null);
}
