# Vertical Express — Production Readiness Audit

**Auditor role:** Principal Engineer / Security / DevOps / QA
**Method:** Live verification against the running Supabase project + Vercel deployments, plus full source inspection. Findings marked **[VERIFIED]** were reproduced against the live system; **[CODE]** were confirmed by reading the source; **[INFERRED]** are reasoned from architecture.
**Date:** current session.

---

## Executive Summary

**Overall Production Score: 34 / 100**
**Launch readiness: ❌ DO NOT LAUNCH.**

The application is a genuinely capable, well-architected commerce platform at the *code* level — clean service layer, typed end-to-end, sensible flows. But it is **not safe to put in front of one real user, let alone thousands**, because of one catastrophic data-exposure hole and a cluster of "the feature looks done but isn't wired" gaps.

### Top 5 launch-blocking risks
1. **[VERIFIED] Supabase Row-Level Security is OFF on every table.** The public anon key — which ships in the browser bundle — can read `users`, `profiles`, `orders`, `payments`, `addresses`, `carts` directly through Supabase's REST API, bypassing 100% of the app's `where: { userId }` authorization. This is a full customer-PII + order + payment breach waiting to happen. **CVSS ~9.1 (Critical).**
2. **[VERIFIED] Production deploys are failing.** Every recent Vercel production deployment shows `UNKNOWN`/errored status; the last healthy one is 5 days old. The live site is stale or broken, and the local `.vercel` link points to an inaccessible project.
3. **[CODE] No real payments.** Only a `DummyPaymentProvider` that instantly "captures." No money can actually be collected; every order is effectively free.
4. **[CODE] Auth is half-migrated and will not deliver a usable code.** The provider was edited to force OTP-code mode, but the free-tier email template still sends a magic link, and `NEXT_PUBLIC_SITE_URL` is `http://localhost:3001` — so links point at localhost and "become invalid." Users cannot reliably log in.
5. **[CODE] Checkout oversells inventory.** Stock is validated and decremented in the same transaction with no row lock and no reservation, at READ COMMITTED isolation — two concurrent orders both pass and both decrement, driving stock negative.

Secondary but serious: no transactional emails, no tax/GST, coupons are dead code, no rate limiting, no tests, no logging/monitoring.

---

## Critical Issues (P0) — must fix before any launch

### P0-1 — Supabase RLS disabled; anon key exposes all data
- **Location:** entire Supabase schema (tables created by Prisma `migrate`, which never enables RLS). No `supabase/migrations` with `ENABLE ROW LEVEL SECURITY`. Client key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Root cause:** The DB was built with **Prisma migrations, not Supabase migrations**. Prisma has no concept of RLS, so every table was created with RLS *disabled*, and Supabase's default grants give the `anon`/`authenticated` roles SELECT/INSERT/UPDATE/DELETE on the public schema. App-level auth (`db.order.findFirst({ where: { userId } })`) is irrelevant because an attacker doesn't go through the app — they call `https://<ref>.supabase.co/rest/v1/orders?select=*` with the public anon key.
- **Impact:** Full read of all users' emails, phones, GSTINs, addresses, order history, and payment records. Likely write access too (verified insert reached a column-constraint error `23502`, not a permission error — RLS did not block it). Data-protection catastrophe.
- **Proof [VERIFIED]:** anon-key `select('*')` succeeded on `users`, `profiles`, `orders`, `payments`, `order_items`, `addresses`, `carts`, `products`.
- **Fix:** Add a SQL migration that, for every user-owned table, runs `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` plus policies `USING (user_id = auth.uid())`; make catalog tables `SELECT`-only for `anon`; and **`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`** then grant back narrowly. Because the app uses Prisma over the **service-role/direct** connection (which bypasses RLS), enabling RLS does **not** break the app — it only closes the REST backdoor. Ship this as `supabase/migrations/0001_rls.sql` and apply via `supabase db push`.
- **Effort:** 3–5 h (write + test every policy).

### P0-2 — No real payment gateway
- **Location:** `lib/services/payments.ts` — `razorpay` maps to `new DummyPaymentProvider()`.
- **Root cause:** Placeholder never replaced (intentionally, pending keys — but it's a launch blocker regardless).
- **Impact:** No revenue can be collected; "Pay online" silently marks orders paid. Anyone can place unlimited "paid" orders for free.
- **Fix:** Implement `RazorpayPaymentProvider` (create order → client checkout → **server-side signature verification** → webhook reconciliation with idempotency on `payments.gatewayEventId`). Gate "Pay online" behind it.
- **Effort:** 1–2 days incl. webhook + test-mode E2E.

### P0-3 — Auth cannot reliably issue a login code
- **Location:** `lib/services/auth-provider.ts` (now omits `emailRedirectTo` to force OTP-code mode), `app/auth/confirm/route.ts` (still built for magic-link `token_hash`), `.env` `NEXT_PUBLIC_SITE_URL="http://localhost:3001"`.
- **Root cause (multiple):**
  1. **Free-tier Supabase** cannot customize the email template (verified earlier: "Email template modification is not available for free tier projects using the default email provider"). The default OTP-signin email renders `{{ .ConfirmationURL }}` — a **magic link**, not the 6-digit `{{ .Token }}`. So users see a link, never a code. The UI asks for a 6-digit code → mismatch.
  2. **Link "becomes invalid":** `emailRedirectTo`/site URL is `localhost:3001`; on the deployed site the link points to localhost (dead), and the Supabase **Redirect URLs allowlist** must contain the real Vercel domain or Supabase rejects the redirect. Single-use token also expires (1 h) and is consumed by email-scanner prefetch (corporate Outlook).
  3. **PKCE:** opening the link in a different browser than the one that requested it fails (no code-verifier cookie).
- **Impact:** Real users can't log in → no checkout, no account. This is the exact symptom you reported.
- **Fix (pick one path):**
  - **Fastest:** configure **custom SMTP** in Supabase (Resend/SES) so you can edit the email template to show `{{ .Token }}`; keep the code-entry UI.
  - **Or** revert to true magic-link UX: pass `emailRedirectTo` = the *production* origin, set `NEXT_PUBLIC_SITE_URL` to the Vercel URL, add that origin to Supabase **Auth → URL Configuration → Redirect URLs**, and make the login UI say "check your email for a link" (drop the code field).
  - Ship SMS OTP (MSG91/Twilio) via `AUTH_OTP_CHANNEL=phone` for the real India-market UX.
- **Effort:** 2–4 h (SMTP path).

### P0-4 — Production deployment broken / project link stale
- **Location:** `.vercel/project.json` → project `prj_cYwYYRGZ…` returns *"project was deleted, transferred, or you don't have access."* Meanwhile a separate `areeb2/homerun-clone` project has recent `UNKNOWN`-status prod deploys; last `Ready` is 5 days old.
- **Root cause [INFERRED]:** duplicate/renamed Vercel projects; recent builds likely fail because **production env vars aren't set** (DATABASE_URL, Supabase keys, ADMIN_EMAILS) or the build errors — couldn't read env because the link is broken.
- **Impact:** The live URL is stale or erroring (prod alias returns 302). Your new banner/hero changes are not actually live.
- **Fix:** Re-link (`vercel link` to the correct project), set all env vars in the Vercel dashboard for Production (see `.env.example`), set `NEXT_PUBLIC_SITE_URL` to the real domain, redeploy, and delete the orphaned project.
- **Effort:** 1 h.

### P0-5 — Inventory oversell race in checkout
- **Location:** `lib/services/checkout.ts` `placeOrder` transaction.
- **Root cause [CODE]:** stock is read (`aggregate qtyOnHand - qtyReserved`) and decremented in the same interactive transaction, but (a) `qtyReserved` is **never written** anywhere — the reservation step from the design was never built, and (b) there is **no `SELECT … FOR UPDATE`** row lock. Prisma runs at Postgres default **READ COMMITTED**, so two concurrent `placeOrder` calls for the last N units both read the same availability, both pass validation, both decrement → negative stock / oversold.
- **Impact:** Overselling scarce SKUs (cement, inverters); operational chaos, refunds, angry contractors.
- **Fix:** Either `SELECT … FOR UPDATE` on the inventory row before decrement, or an atomic conditional update `UPDATE inventory SET qty_on_hand = qty_on_hand - $qty WHERE id=$id AND qty_on_hand >= $qty` and treat 0 rows affected as OUT_OF_STOCK, or bump the transaction to `Serializable` with retry.
- **Effort:** 3–4 h.

### P0-6 — No order idempotency (duplicate orders on retry)
- **Location:** `actions/checkout.ts` `placeOrder`.
- **Root cause [CODE]:** the client button is disabled while `placing` (guards double-click in one tab), but there is **no server idempotency key**. A network retry, page refresh mid-request, or a second tab creates a *second* order + second dummy "capture." With a real gateway this is a double charge.
- **Impact:** Duplicate orders and (post-Razorpay) double charges.
- **Fix:** Generate a client idempotency token per checkout attempt; store it on `orders`; unique-constrain it; return the existing order on replay.
- **Effort:** 3 h.

---

## High Priority (P1)

### P1-1 — No transactional email [CODE]
No Resend/SES/nodemailer anywhere. Order confirmation, OTP-by-email fallback, shipping, refund, booking — none send. The confirmation page renders but the customer gets nothing in their inbox. **Fix:** integrate Resend + React Email for the transactional set. **Effort:** 1 day.

### P1-2 — No tax / GST [CODE]
`computeTotals` has no tax logic. For a B2B construction supplier in India this is non-negotiable — contractors need GST invoices for input credit. `profiles.gstin` is captured but never used. **Fix:** add GST calc + downloadable tax invoice on the order. **Effort:** 1–2 days.

### P1-3 — Coupons are dead code [CODE]
`discountPaise` is hard-coded to `0` in `computeTotals`; the `FIRST3` seed coupon and the entire `coupons` table are never read at checkout. The "free delivery first 3 orders" promise on the homepage/popup is unfulfilled. **Fix:** wire coupon validation + application into `computeTotals`. **Effort:** 4–6 h.

### P1-4 — No rate limiting [CODE]
`actions/auth.ts` only *labels* a `RATE_LIMITED` error; there is no Upstash/limiter. OTP-send, login, search-suggest, and booking submission are unthrottled → SMS/email cost abuse, enumeration, scraping. Relies solely on Supabase's built-in auth limits. **Fix:** add `@upstash/ratelimit` on OTP send, booking, and search-suggest. **Effort:** half day.

### P1-5 — Admin authz is an env allowlist, and `/admin` isn't guarded in middleware [CODE]
`ADMIN_EMAILS` is fine for MVP, but: the middleware `matcher` protects `/account` and `/checkout`, **not `/admin`** — the admin layout redirects server-side (OK), but there's no defense-in-depth and no `admin_users` table/audit. Also there is no `audit_logs` table despite admin mutations (I removed the audit write when the model turned out missing). **Fix:** add `/admin` to middleware, create `admin_users` + `audit_logs`, log every admin state change. **Effort:** half day.

### P1-6 — Guest cart / wishlist edge cases [CODE]
Wishlist heart for a guest optimistically toggles then rolls back (no login redirect) — confusing. Guest `anon_id` cart cookie merge works, but there's no cap on guest cart size and no cleanup of abandoned guest carts (table grows unbounded). **Fix:** login-redirect on wishlist for guests; cron to prune stale anon carts. **Effort:** 3 h.

### P1-7 — `qtyReserved` column is inert [CODE/DB]
The schema models reservations but nothing uses them; checkout should reserve on `beginCheckout` and release on timeout. Dead column today; the mechanism the oversell fix (P0-5) needs. **Fix:** implement reserve/release. **Effort:** rolled into P0-5.

---

## Medium Priority (P2)

- **P2-1 — Soft-404s [CODE]:** unknown `/category/x` and `/product/x` render the 404 page but return HTTP 200 (Next streamed-route behavior). Bad for SEO indexing. Fix with `notFound()` earlier or an explicit status.
- **P2-2 — No logging/observability [CODE]:** no Sentry, no structured logs in route handlers/actions. Production errors are invisible. Add Sentry + `after()` logging.
- **P2-3 — Search won't scale [CODE]:** Postgres `ILIKE` on `products`; fine at 45 SKUs, degrades past a few thousand. The service is Typesense-swappable by design — do it before catalog growth.
- **P2-4 — Price/discount sort loads full filtered set into JS [CODE]:** `catalog.listProducts` fetches all matching rows then sorts in memory for price/discount sorts. Fine now, O(n) memory at scale. Move to SQL `ORDER BY`.
- **P2-5 — Missing DB indexes for common filters [DB]:** brand/price facet queries and `bookings`/`orders` status filters would benefit from composite indexes; `product_variants(price_paise)` has none.
- **P2-6 — CartProvider fires 2 server actions on every page load [CODE]:** `getCart()` + `getMyWishlistIds()` on mount site-wide adds latency to first interaction. Batch or defer.
- **P2-7 — No security headers / CSP [CODE]:** `next.config` has no CSP, HSTS, or frame-deny.
- **P2-8 — Images use raw `<img>` not `next/image` [CODE]:** banners and product/category images skip Next's optimization → larger LCP. Deliberate for runtime fallback, but costs Core Web Vitals.

## Low Priority (P3)
- Dead code: `lib/data.ts` `DEALS`/`Product` type largely superseded by DB; `funding-banner.tsx` now unused after removal; `PlaceholderImage` mostly unused.
- Two parallel "services" sources: `lib/services.ts` (static, for the marketing page) vs DB `service_categories` — divergence risk.
- Money is integer paise everywhere (good), but a few display helpers duplicate formatting.
- `NEXT_PUBLIC_SITE_URL` inconsistent (`3000` in `.env.example`, `3001` in `.env`).

---

## Authentication Report
Flow: `/login` → `sendOtp` (`signInWithOtp`) → email → `/auth/confirm?token_hash` → `verifyOtp` → session cookie via `@supabase/ssr` → middleware refresh → guards `/account`,`/checkout`. **Signup** = same passwordless path (`shouldCreateUser:true`). **Password reset** — none (passwordless). **Logout** — `signOut` action, works. **Session refresh** — middleware `getUser()` on matched routes, works. **Root cause of your symptom** is P0-3 above: free-tier template sends a link not a code, and the redirect/site URL points at localhost + isn't in Supabase's allowlist, so the link 404s/expires → "invalid." **Verdict: ⚠ half-working, blocks real users.**

## Checkout Report
Cart (server, tier-priced, guest anon cookie) → address select + serviceability → payment (dummy/COD) → `placeOrder` transaction (stock validate → order+items+payment+status event → decrement → clear cart) → confirmation. **Failure points:** oversell race (P0-5), duplicate on retry (P0-6), no real payment (P0-2), no coupon/tax (P1-2/3), no email (P1-1). Browser-back after order → cart already cleared (OK). Network failure mid-order → possible orphan (order created, response lost) with no idempotent replay. **Verdict: ❌ not production-safe.**

## Backend Report
Clean service layer (`lib/services/*`), typed `ActionResult` envelope, zod validation at boundaries, transactions used for orders/cancel. Weaknesses: the oversell race, no idempotency, `discountPaise` hardcoded, no rate limiting, no audit log, a couple of N+1-ish loops (per-line inventory `findFirst` in `placeOrder` and `reorder` — fine at small carts). Authorization is code-level only (see RLS P0-1). **Verdict: ⚠ solid skeleton, unsafe defaults.**

## Frontend Report
Strong: reusable components, URL-state filters, skeletons, accessible landmarks (`#main-content` added), reduced-motion respected, responsive. Gaps: raw `<img>` (LCP), soft-404s, guest-wishlist UX, 2 server actions on mount, no error boundaries on some routes. **Verdict: ✅ good, minor polish.**

## Database Report
Well-normalized, integer paise, sensible FKs and enums, good indexes on the hot paths (`products(category_id,status)`, `orders(user_id, placed_at)`). Issues: RLS off (P0-1), `qtyReserved` inert, missing a few facet/status composite indexes, no `audit_logs`/`admin_users` tables, catalog `Subcategory` modeled in docs but not used. **Verdict: ⚠ good design, security-open.**

## Security Report
| Finding | Severity |
|---|---|
| RLS disabled, anon key reads/writes all tables | **Critical (CVSS ~9.1)** |
| No real payment signature verification (dummy) | High |
| Auth redirect to localhost + open until fixed | High |
| No rate limiting (OTP/search/booking abuse) | Medium |
| No CSP/security headers | Medium |
| Admin gated by env email only, no audit trail | Medium |
| Soft-404 info (minor) | Low |
No secrets committed (`.env` gitignored — good). XSS surface low (React escaping; only `dangerouslySetInnerHTML` is JSON-LD, safe). CSRF handled by Server Actions. **Verdict: ❌ one critical, several high.**

## Performance Report
Catalog pages static/ISR (good), 45 PDPs prebuilt. Concerns: raw images, in-memory price sort, ILIKE search, CartProvider double-fetch, no image optimization. At current data it's fast; the listed items bite at scale. **Verdict: ✅ now / ⚠ at growth.**

## Architecture Report — will it scale?
- **100 users:** ✅ fine, once RLS + payments + auth are fixed.
- **1,000:** ✅ with Razorpay + rate limiting + email.
- **10,000:** ⚠ move search to Typesense, add read replica/caching, queue emails/webhooks, SQL-side sorting, `next/image`.
- **100,000:** ⚠⚠ needs multi-warehouse inventory with proper reservation/locking, Redis for cart/session, background workers (QStash), observability, and load-tested checkout. The service-layer boundary makes all of this feasible without a rewrite — the bones are right; the operational hardening is missing.

---

## Production Readiness Checklist
| Area | Status |
|---|---|
| Authentication | ⚠ Needs Work (can't reliably issue code) |
| Payments | ❌ Broken (dummy only) |
| Checkout | ❌ Broken (oversell + no idempotency) |
| Database | ⚠ Needs Work (RLS off) |
| Storage | ⚠ (Supabase Storage buckets/policies never configured; images served from `/public`) |
| Emails | ❌ Broken (none) |
| Logging | ❌ Broken (none) |
| Monitoring | ❌ Broken (none) |
| Testing | ❌ Broken (zero automated tests) |
| Security | ❌ Broken (RLS) |
| Deployment | ⚠ Needs Work (failing/stale prod, broken link) |
| Performance | ✅ Ready (current scale) |

---

## Quick Wins (< 30 min each)
- Set `NEXT_PUBLIC_SITE_URL` to the real Vercel domain; add it to Supabase Redirect URLs.
- Add `/admin` to the middleware matcher.
- Add security headers in `next.config.ts`.
- Add Supabase Redirect URL allowlist entry.
- Delete the orphaned Vercel project; re-link the correct one.
- Fix `.env` vs `.env.example` port drift.

## High-ROI Improvements
1. **Enable RLS** (closes the breach) — highest ROI by far.
2. **Custom SMTP + template** (unblocks login for everyone).
3. **Razorpay + signature verification** (enables revenue).
4. **Atomic stock decrement** (stops oversell).
5. **Order idempotency key** (stops dupes/double charge).
6. **Resend transactional emails** (trust + support deflection).

## Refactoring Opportunities
- Collapse `lib/data.ts` static product/deal types now that catalog is DB-backed.
- Unify static `lib/services.ts` with DB `service_categories`.
- Move price/discount sort and facets into SQL.
- Introduce a thin `logger` used by every action/route.

---

## Final Verdict

**Should this launch today? No — unambiguously not.**

It is closer than most MVPs: the architecture is clean and the happy paths work. But you would be shipping a site that (1) leaks every customer's PII, orders, and payment records to anyone with the public key, (2) can't take money, (3) can't reliably log users in, (4) isn't actually deployed successfully, and (5) oversells stock. Any one of 1–3 is a launch blocker on its own.

**Minimum bar to launch (in order):**
1. Enable RLS + revoke anon grants (P0-1) — **non-negotiable, do first.**
2. Fix auth email delivery via custom SMTP or true magic-link config (P0-3).
3. Integrate Razorpay with server-side verification (P0-2).
4. Atomic stock decrement + order idempotency (P0-5, P0-6).
5. Repair the Vercel project + env vars and get a green production deploy (P0-4).
6. Transactional emails (P1-1), then GST (P1-2) and coupons (P1-3).

Realistic effort to a safe soft-launch: **~1.5–2 focused engineering weeks.** The good news: because business logic lives in `lib/services/*` and money is integer paise throughout, none of these fixes require re-architecture — they're targeted, bounded changes.
