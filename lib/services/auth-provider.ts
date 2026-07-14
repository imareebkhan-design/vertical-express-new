import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * OTP provider abstraction.
 *
 * The login UI is channel-agnostic: it collects an identifier (email today,
 * phone once an SMS provider such as MSG91/Twilio is configured in Supabase)
 * and a one-time code. Switching channels is a configuration change:
 * set AUTH_OTP_CHANNEL="phone" — no UI or action changes required.
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
    const { error } = await supabase.auth.signInWithOtp(
      this.channel === "email"
        ? {
            email: identifier,
            options: {
              shouldCreateUser: true,
              // Point the emailed link at our own confirm route so it exchanges
              // the token for a session on OUR domain (otherwise it defaults to
              // Supabase's Site URL and lands on localhost/nowhere → "invalid
              // link"). NOTE: whether the email shows a LINK or a 6-digit CODE
              // is controlled by the email TEMPLATE, not this option — the
              // free-tier default template sends a link. To send a code, add
              // custom SMTP and put {{ .Token }} in the Magic Link template.
              emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
            },
          }
        : { phone: identifier, options: { shouldCreateUser: true } }
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  async verify(identifier: string, token: string): Promise<OtpVerifyResult> {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.verifyOtp(
      this.channel === "email"
        ? { email: identifier, token, type: "email" }
        : { phone: identifier, token, type: "sms" }
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
