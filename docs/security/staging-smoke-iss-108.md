# Staging smoke tests — ISS-108 security update

Run these on **staging only**, after the owner approves deploying
`claude/security-codacy-fixes` there. Use staging accounts and Razorpay
**test mode** only. Nothing here touches production or real money.

The dependency update changes the libraries behind three things that unit tests
cannot exercise: Firebase token and session verification (`firebase-admin`
14.3 → 14.5, `google-auth-library` 10 → 11, `gaxios` 6 → 7/8), product-image
storage (`@google-cloud/storage` 7 → 8) and the Capacitor shells (8.5 → 8.6).

## Part A — automated, read-only (no account needed)

```bash
node scripts/staging-security-smoke.mjs https://<staging-host> <a-live-product-slug>
```

| # | Check | Expected |
|---|---|---|
| A1 | `POST /api/auth/session` with an invalid ID token | `401` |
| A2 | Cross-site `text/plain` POST to `/api/auth/session` | Today `401` (handler reached) — reported as **OPEN** (ISS-109). After that fix: `403` or `415` |
| A3 | `GET /api/v1/me` with no token, and with `Bearer not-a-real-token` | `401` both |
| A4 | `POST /api/admin/product-images` with a foreign `Origin` | `403` |
| A5 | Same, same-origin but signed out | `403` |
| A6 | `GET /api/cron/cleanup-orders` without the secret | `401`/`403` |
| A7 | Home page and one product page: every `application/ld+json` block | Parses as JSON; contains no raw `<` |

The script exits non-zero if any check other than A2 fails.

## Part B — signed-in checks (manual, staging accounts)

### B1. Sign-in and session lifecycle (`firebase-admin` auth)
1. Sign in on the web with a staging customer (phone OTP test number or Google).
   **Expect:** redirected signed in; `/account` loads; the `session` cookie is
   `HttpOnly`, `Secure`, `SameSite=Lax`.
2. Reload `/account` after 2 minutes. **Expect:** still signed in (session cookie
   verifies with `checkRevoked`).
3. Sign out. **Expect:** `/account` redirects to `/login`.
4. Sign in on two browsers, then on one call sign-out-everywhere
   (`DELETE /api/auth/session?scope=all`). **Expect:** the other browser is signed
   out on its next request.
5. In the Expo app on staging, sign in and open Account and Orders. **Expect:**
   API calls succeed (bearer ID token verified server-side).

### B2. Invalid and revoked tokens
1. Disable the staging test user in the Firebase console, then reload `/account`
   in a browser where it was signed in. **Expect:** treated as signed out.
   Re-enable the user afterwards.
2. Edit the `session` cookie value by one character. **Expect:** signed out, no
   500 in the logs.

### B3. Admin access
1. Sign in as an `ADMIN_EMAILS` operator with a verified email. **Expect:** `/admin` loads.
2. Sign in as a customer. **Expect:** `/admin` shows the "not an operator" screen, not a redirect loop.

### B4. Product-image upload and retrieval (`@google-cloud/storage` 8)
Use a staging QA product, never a live catalogue product.
1. Upload a new JPEG or PNG under 8 MB (`MAX_IMAGE_BYTES`). **Expect:** `200 {ok:true}`; the image
   appears on the admin product page; its public URL loads with
   `Cache-Control: public, max-age=31536000, immutable`.
2. Upload the **same file** again to the same product. **Expect:** success, no
   duplicate image row (deduplicated by SHA-256 before storage is called).
3. Remove that image from the product, then upload the same file again.
   **Expect:** success. The object already exists, so Storage answers `412`
   to the `ifGenerationMatch: 0` precondition and the store treats it as
   "already stored". A `500` or an error toast here means the error shape
   changed in Storage 8 and must be fixed before merge.
4. Upload a file over 8 MB. **Expect:** `413` with the size message.
5. Check the staging logs for any `gaxios`/`google-auth-library` errors during
   1–4. **Expect:** none.

### B5. Structured data
1. Paste the staging product URL into Google's Rich Results Test. **Expect:**
   Product and BreadcrumbList detected, no errors.
2. On a QA product, set the title to `Drill </script><b>x</b>` in admin, view the
   page source. **Expect:** the title appears as `</script>` inside the
   JSON-LD and the page renders normally. Restore the title afterwards.

### B6. Checkout and payment regression (test mode only)
1. With staging in Razorpay **test mode**, place an order with a test card.
   **Expect:** order number of the form `VE-<year>-<base36 time><4 hex>`; payment
   captured; order confirmed once.
2. Double-click Place Order. **Expect:** one order (idempotency key).
3. Refund it from admin with a reason. **Expect:** test-mode refund created,
   audit row written.

### B7. Native shells (Capacitor 8.6)
Build the iOS and Android shells against staging. **Expect:** app launches,
loads the storefront, deep link `verticalexpress://` opens the app, sign-in works.

## Recording results

Record each step as PASS/FAIL with the time and any request ID in the readiness
notes. Any FAIL in B1, B2 or B4 blocks merge.
