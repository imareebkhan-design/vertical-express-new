# Phone OTP via MSG91 — setup

**Status:** code ready, blocked on the owner. Nothing here is live yet. (ISS-006)

## What is already true

**No code change is needed to accept phone logins.** `actions/auth.ts` picks the channel
from the identifier itself — an input containing `@` is treated as email, anything else as
a phone number, normalised to E.164 (`9876543210` → `+919876543210`). Both channels can
work at once.

> The handover says `AUTH_OTP_CHANNEL=phone` is "a config flip". **That is wrong.** That
> variable is read only by `lib/services/auth-provider.ts`, which nothing imports. Setting
> it changes nothing. Ignore it.

What is missing is only the thing that physically sends the SMS.

## Why MSG91 needs a hook

Supabase Auth natively supports **MessageBird, Twilio, Vonage and TextLocal**. MSG91 is not
among them, so it goes through a **Send SMS Hook**: Supabase generates the OTP and calls our
Edge Function, which hands the message to MSG91.

Function: `supabase/functions/send-sms-hook/index.ts`.

## Owner steps

### 1. DLT registration — start this first, it is the long pole

Indian regulation requires the sender ID and every message template to be registered on a
DLT portal *before* any transactional SMS will deliver. This takes days and needs business
documents (GST certificate, PAN, authorisation letter). MSG91 can guide it, but the
registration is yours.

Register a template whose body contains one variable for the code, e.g.

> `Your Vertical Express verification code is {#var#}. Do not share it with anyone.`

Note the **template ID** and the approved **6-character sender ID**.

### 2. MSG91 account

Sign up, complete KYC, note the **authkey** from the dashboard.

### 3. Confirm the API contract — do not skip this

The MSG91 call in the hook is written from their public v5 flow API but **has not been
verified against a real request**; their reference sits behind a login. Open the MSG91
dashboard, copy the curl example, and check three things against `sendViaMsg91`:

1. the endpoint path
2. the auth header name (`authkey` vs `Authorization`)
3. the body shape — `template_id`, `recipients[]`, and **the variable name your DLT
   template uses for the code** (it is often not `otp`)

Send one live test SMS before enabling the hook. Then delete the warning comment in the file.

### 4. Deploy the function and set secrets

```bash
supabase functions deploy send-sms-hook --no-verify-jwt

supabase secrets set MSG91_AUTHKEY=...
supabase secrets set MSG91_TEMPLATE_ID=...
supabase secrets set MSG91_SENDER_ID=...
```

### 5. Enable the hook

Supabase dashboard → **Authentication → Hooks → Send SMS**. Point it at the function URL.
Supabase gives you a signing secret (`v1,whsec_...`):

```bash
supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_...'
```

The hook verifies this signature on every call. Without it, anyone who found the URL could
make you send SMS at your own cost, or probe which numbers exist.

### 6. Enable phone auth

Supabase dashboard → **Authentication → Providers → Phone** → enable.

### 7. Test with a real handset

Log in with a real number end to end. **Watch the function logs** — a failure here means
nobody can log in.

## Twilio fallback

If MSG91 delivery or DLT approval stalls, Twilio is native: **Authentication → Providers →
Phone → Twilio**, paste Account SID, Auth Token and Messaging Service SID. Disable the Send
SMS Hook when you do — the hook overrides the built-in provider. No code change either way.
DLT registration is still required; it is an Indian telecom rule, not a provider one.

## What breaks if this is wrong

The hook runs on **every** phone OTP. If it errors, users see "Could not send verification
code" and cannot log in. The OTP is never logged; failures log the user id so they can be
correlated with Supabase auth logs.
