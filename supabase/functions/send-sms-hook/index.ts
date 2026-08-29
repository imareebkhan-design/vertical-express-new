/**
 * Supabase Send SMS Hook → MSG91.
 *
 * Supabase Auth natively supports MessageBird, Twilio, Vonage and TextLocal.
 * MSG91 is not among them, so phone OTP goes through this hook: Supabase calls
 * it with the user and the generated OTP, and this function hands the message to
 * MSG91. (ISS-006)
 *
 * Deploy:
 *   supabase functions deploy send-sms-hook --no-verify-jwt
 *
 * Secrets (set with `supabase secrets set`, never committed):
 *   SEND_SMS_HOOK_SECRET   given by Supabase when you enable the hook (v1,whsec_...)
 *   MSG91_AUTHKEY          from the MSG91 dashboard
 *   MSG91_TEMPLATE_ID      the DLT-approved template that contains the OTP variable
 *   MSG91_SENDER_ID        the DLT-approved 6-character sender ID
 *
 * The hook is called for EVERY phone OTP. If it throws or returns non-200, the
 * user cannot log in — so failures are logged with enough context to diagnose,
 * and the OTP itself is never logged.
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

interface SendSmsPayload {
  user: { id: string; phone: string };
  sms: { otp: string };
}

/**
 * Hand the OTP to MSG91.
 *
 * ⚠ UNVERIFIED CONTRACT. MSG91's request shape below is written from their
 * public v5 flow API as commonly documented, but it has NOT been confirmed
 * against a real request/response — their API reference sits behind a login.
 * Before enabling this hook in production, open the MSG91 dashboard, copy the
 * curl example for the flow API, and check three things:
 *   1. the endpoint path
 *   2. the auth header name (`authkey` vs `Authorization`)
 *   3. the body shape — template_id, recipients[], and the variable name your
 *      DLT template uses for the OTP (it is NOT always `otp`)
 * Then delete this notice.
 */
async function sendViaMsg91(phone: string, otp: string): Promise<void> {
  const authkey = Deno.env.get("MSG91_AUTHKEY");
  const templateId = Deno.env.get("MSG91_TEMPLATE_ID");
  const senderId = Deno.env.get("MSG91_SENDER_ID");

  if (!authkey || !templateId) {
    // Fail loudly rather than silently not sending: a login that never arrives
    // is worse than one that errors, because nobody knows it is broken.
    throw new Error("MSG91 is not configured (MSG91_AUTHKEY / MSG91_TEMPLATE_ID missing)");
  }

  // MSG91 wants the number without a leading "+".
  const mobile = phone.replace(/^\+/, "");

  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey },
    body: JSON.stringify({
      template_id: templateId,
      ...(senderId ? { sender: senderId } : {}),
      recipients: [{ mobiles: mobile, otp }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MSG91 responded ${res.status}: ${body.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!secret) {
    console.error("SEND_SMS_HOOK_SECRET is not set — refusing to process");
    return new Response(JSON.stringify({ error: "not configured" }), { status: 500 });
  }

  const raw = await req.text();

  let payload: SendSmsPayload;
  try {
    // Standard Webhooks signature. Without this anyone who finds the URL could
    // make us send SMS at our own cost, or probe for valid numbers.
    const wh = new Webhook(secret.replace("v1,whsec_", ""));
    payload = wh.verify(raw, Object.fromEntries(req.headers)) as SendSmsPayload;
  } catch (err) {
    console.error("signature verification failed", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  try {
    await sendViaMsg91(payload.user.phone, payload.sms.otp);
    // Never log the OTP. The user id is enough to correlate with auth logs.
    console.log(JSON.stringify({ event: "sms_sent", userId: payload.user.id }));
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: "sms_failed", userId: payload.user.id, message }));
    // Supabase surfaces this to the caller, so keep it useful but not leaky.
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: "Could not send verification code" } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
