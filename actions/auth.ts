"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureUserMirror } from "@/lib/services/users";
import { mergeGuestCart } from "@/lib/services/cart-merge";
import { rateLimit } from "@/lib/services/rate-limit";
import { createSupabaseServer } from "@/lib/supabase/server";
import { phoneSchema, type ActionResult, fail, succeed } from "@/lib/validators";
import { headers } from "next/headers";
import { runWithContext, trackEvent, MetricsTracker, captureException } from "@/lib/observability";

const ANON_CART_COOKIE = "ve_anon_cart";

const identifierSchema = z.union([
  z.string().email("Enter a valid email address"),
  phoneSchema,
]);

async function getActionContext(userId?: string) {
  const reqHeaders = await headers();
  const requestId = reqHeaders.get("x-request-id") || `action-${Math.random()}`;
  return { requestId, userId };
}

/** Step 1: send a one-time code / login link to the identifier (detects email vs phone). */
export async function sendOtp(rawIdentifier: string): Promise<ActionResult<{ channel: "email" | "phone" }>> {
  const ctx = await getActionContext();
  return runWithContext(ctx, async () => {
    const metric = new MetricsTracker("auth-service");
    try {
      const parsed = identifierSchema.safeParse(rawIdentifier.trim().toLowerCase());
      if (!parsed.success) {
        return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input", "identifier");
      }

      const value = parsed.data;
      const channel = value.includes("@") ? ("email" as const) : ("phone" as const);
      const formattedIdentifier = channel === "phone" 
        ? (value.startsWith("+") ? value : `+91${value.replace(/\D/g, "")}`) 
        : value;

      // Fails closed (ISS-021, DEC-016): if the limiter is unreachable we refuse
      // to send rather than risk OTP-bombing a victim and paying for every SMS.
      const limit = await rateLimit(`otp:${formattedIdentifier}`, 5, 15 * 60 * 1000, {
        failClosed: true,
      }); // 5 per 15 min
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
        captureException(error, { channel });
        return fail("RATE_LIMITED", error.message ?? "Could not send code. Try again shortly.");
      }

      metric.end("send_otp_success", { channel });
      return succeed({ channel });
    } catch (err) {
      captureException(err);
      return fail("RATE_LIMITED", "Could not send code. Please try again later.");
    }
  });
}

/** Step 2: verify the code, establish the session, mirror the user, merge guest cart. */
export async function verifyOtp(
  rawIdentifier: string,
  token: string
): Promise<ActionResult<{ userId: string }>> {
  const ctx = await getActionContext();
  return runWithContext(ctx, async () => {
    const metric = new MetricsTracker("auth-service");
    try {
      const parsed = identifierSchema.safeParse(rawIdentifier.trim().toLowerCase());
      if (!parsed.success) return fail("VALIDATION", "Invalid identifier", "identifier");

      const value = parsed.data;
      const channel = value.includes("@") ? ("email" as const) : ("phone" as const);
      const formattedIdentifier = channel === "phone" 
        ? (value.startsWith("+") ? value : `+91${value.replace(/\D/g, "")}`) 
        : value;
      
      if (!/^[A-Za-z0-9]{6,12}$/.test(token.trim())) {
        return fail("VALIDATION", "Enter the 6-digit code", "token");
      }

      const supabase = await createSupabaseServer();
      const { data, error } = await supabase.auth.verifyOtp(
        channel === "email"
          ? { email: formattedIdentifier, token: token.trim(), type: "email" }
          : { phone: formattedIdentifier, token: token.trim(), type: "sms" }
      );

      if (error || !data.user) {
        trackEvent("login_failed", { channel });
        return fail("UNAUTHENTICATED", error?.message ?? "Invalid or expired code", "token");
      }

      await ensureUserMirror({ userId: data.user.id, email: data.user.email ?? null, phone: data.user.phone ?? null });

      const cookieStore = await cookies();
      const anonId = cookieStore.get(ANON_CART_COOKIE)?.value ?? null;
      await mergeGuestCart(data.user.id, anonId);
      if (anonId) cookieStore.delete(ANON_CART_COOKIE);

      revalidatePath("/", "layout");

      // Update current run context to include the userId for subsequent metrics/logs
      ctx.userId = data.user.id;

      trackEvent("login_success", { channel });
      metric.end("verify_otp_success", { userId: data.user.id });
      return succeed({ userId: data.user.id });
    } catch (err) {
      captureException(err);
      return fail("UNAUTHENTICATED", "Could not verify code. Please try again later.");
    }
  });
}

export async function signOut(): Promise<ActionResult<null>> {
  const ctx = await getActionContext();
  return runWithContext(ctx, async () => {
    const metric = new MetricsTracker("auth-service");
    try {
      const supabase = await createSupabaseServer();
      await supabase.auth.signOut();
      trackEvent("logout");
      metric.end("sign_out_success");
      return succeed(null);
    } catch (err) {
      captureException(err);
      return succeed(null);
    }
  });
}
