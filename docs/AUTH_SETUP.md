# Auth setup — required Supabase + Vercel configuration (P0-3)

The code now sends the login email with a link that returns to **`${NEXT_PUBLIC_SITE_URL}/auth/confirm`**, which exchanges the token for a session. For this to work in production you must set three things outside the code:

## 1. Vercel env var (required)
Set for the **Production** environment:
```
NEXT_PUBLIC_SITE_URL = https://<your-production-domain>
```
Locally `.env` keeps `http://localhost:3000` — that's correct for dev only.

## 2. Supabase → Authentication → URL Configuration (required)
- **Site URL:** `https://<your-production-domain>`
- **Redirect URLs (allowlist):** add
  - `https://<your-production-domain>/auth/confirm`
  - `http://localhost:3000/auth/confirm` (for local dev)

If the domain isn't in this allowlist, Supabase rejects the link → "invalid link."

## 3. Login email: link (works now) vs 6-digit code (needs SMTP)
- **Out of the box (free tier):** the email contains a **magic link**. Users tap it and land signed in. This works today with steps 1–2 done. The login screen leads with this.
- **To send a 6-digit CODE instead:** whether the email shows a link or a code is controlled by the **email template**, not by any code flag. To show a code:
  1. Supabase → Project Settings → **Auth → SMTP Settings** → configure a custom SMTP provider (e.g. Resend, SES). Free-tier default email cannot use custom templates.
  2. Supabase → Authentication → **Email Templates → Magic Link** → include `{{ .Token }}` in the body.
  The login screen already accepts a code, so no code change is needed.

## 4. (Recommended for the real India-market UX) SMS OTP
Configure an SMS provider (MSG91/Twilio) in Supabase → Auth → Providers → Phone, then set `AUTH_OTP_CHANNEL=phone`. The provider abstraction (`lib/services/auth-provider.ts`) already supports this with no code change.

## Common "link becomes invalid" causes (all addressed by 1–2 above)
- Redirect target was localhost / not allowlisted → **fixed by 1 + 2**.
- Single-use token already consumed by a corporate email scanner that pre-fetches links → unavoidable with links; use SMS OTP or a code (step 3) for those users.
- Link opened in a different browser than the one that requested it (PKCE) → use the same browser, or use a code.
