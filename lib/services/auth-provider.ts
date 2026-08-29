import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * OTP provider abstraction.
 *
 * ⚠ NOT ON THE LIVE LOGIN PATH. Nothing imports this module except its own
 * tests. `actions/auth.ts` calls `supabase.auth.signInWithOtp` directly and
 * chooses the channel from the identifier itself — `value.includes("@")` — so
 * `AUTH_OTP_CHANNEL` has no effect on how anyone actually logs in.
 *
 * That is not a bug in the behaviour: auto-detecting from the identifier is
 * better than a global switch, because it lets email and phone coexist during a
 * migration instead of forcing one for everybody. Phone login therefore needs no
 * code change at all — only an SMS provider configured in Supabase (ISS-006).
 *
 * It IS a documentation hazard: the handover records "AUTH_OTP_CHANNEL=phone is
 * a config flip", which would do nothing. Kept because a real provider
 * abstraction is worth having when a second one arrives; delete it if that never
 * happens rather than leaving a module that looks load-bearing and is not.
 */
export type OtpChannel = "email" | "phone";

export interface OtpSendResult {
  ok: boolean;
  message?: string;
}

export interface OtpVerifyResult {
  ok: boolean;
  userId?: string;
  email?: string | null;
  phone?: string | null;
  message?: string;
}

export interface OtpProvider {
  readonly channel: OtpChannel;
  send(identifier: string): Promise<OtpSendResult>;
  verify(identifier: string, token: string): Promise<OtpVerifyResult>;
}

class SupabaseOtpProvider implements OtpProvider {
  constructor(readonly channel: OtpChannel) {}

  async send(identifier: string): Promise<OtpSendResult> {
    const supabase = await createSupabaseServer();
    const formattedId = this.channel === "phone" && !identifier.startsWith("+") 
      ? `+91${identifier.replace(/\D/g, "")}` 
      : identifier;
    const { error } = await supabase.auth.signInWithOtp(
      this.channel === "email"
        ? {
            email: formattedId,
            options: {
              shouldCreateUser: true,
              emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
            },
          }
        : { phone: formattedId, options: { shouldCreateUser: true } }
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  async verify(identifier: string, token: string): Promise<OtpVerifyResult> {
    const supabase = await createSupabaseServer();
    const formattedId = this.channel === "phone" && !identifier.startsWith("+") 
      ? `+91${identifier.replace(/\D/g, "")}` 
      : identifier;
    const { data, error } = await supabase.auth.verifyOtp(
      this.channel === "email"
        ? { email: formattedId, token: token.trim(), type: "email" }
        : { phone: formattedId, token: token.trim(), type: "sms" }
    );
    if (error || !data.user) {
      return { ok: false, message: error?.message ?? "Invalid or expired code" };
    }
    return {
      ok: true,
      userId: data.user.id,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
    };
  }
}

export function getOtpChannel(): OtpChannel {
  return process.env.AUTH_OTP_CHANNEL === "phone" ? "phone" : "email";
}

export function getOtpProvider(): OtpProvider {
  return new SupabaseOtpProvider(getOtpChannel());
}
