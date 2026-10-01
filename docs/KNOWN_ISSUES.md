# Known Issues — Vertical Express

*Every issue below is supported by direct source inspection or live-site probing
recorded in `CURRENT_SYSTEM_AUDIT.md`. **No defect here is speculative.** If you find a
new issue, add it with the same fields and the evidence that supports it.*

**Status values:** `OPEN` · `IN PROGRESS` · `BLOCKED (OWNER)` · `BLOCKED (CA/LEGAL)` · `FIXED` · `WONTFIX`

**Severity:** `CRITICAL` (loses money or breaks the law today) · `HIGH` (blocks launch) ·
`MEDIUM` (blocks confidence) · `LOW` (quality/debt)

---

## ISS-089 — Mobile web OTP verifier attachment and resend cooldown

**1 October 2026 · MEDIUM · Auth · FIXED locally; real SMS verification open.**

`components/mobile/auth/mobile-sign-in-view.tsx` rendered the reCAPTCHA holder at different unkeyed child positions in its phone/code branches. React replaced the element during a successful send, detaching Firebase's widget. Stable matching keys preserve the exact element and widget children across both transitions. The cooldown depended only on whether a confirmation existed, so a successful resend never restarted it; it now also depends on the new confirmation object.

Two component regression tests fail against the old behavior and pass with the fix. UI 74/74, TypeScript and ESLint pass. The 390 × 844 phone-entry render was checked; live Firebase resend was not exercised. Evidence: workspace `docs/evidence/loop-2026-10-01/iter29-phone-auth.md`.

This does **not** establish the cause of the owner's original red error. Firebase's [web phone-auth guide](https://firebase.google.com/docs/auth/web/phone-auth) excludes localhost for real phone authentication. The original surface and exact failing response remain unconfirmed. Test-number success is insufficient evidence for real SMS; no Firebase configuration or security protection was changed.

## Summary

| ID | Title | Sev | Area | Status |
|---|---|---|---|---|
| ISS-089 | Mobile web OTP step detached reCAPTCHA; successful resend did not restart cooldown | MEDIUM | Auth | FIXED (local; real SMS unverified) |
| ISS-001 | GST added on top of displayed prices | CRITICAL | Money/Tax | FIXED |
| ISS-002 | Dummy payment gateway confirms orders with no money | CRITICAL | Payments | FIXED |
| ISS-003 | Razorpay HTTP call executes inside DB transaction | HIGH | Checkout | FIXED |
| ISS-004 | Inventory decrement not scoped to warehouse | HIGH | Inventory | FIXED |
| ISS-005 | Payment capture amount never verified | HIGH | Payments | FIXED |
| ISS-006 | Authentication uses email OTP, not phone | HIGH | Auth | BLOCKED (OWNER) |
| ISS-007 | Entire catalog is fictional | CRITICAL | Data | BLOCKED (OWNER) |
| ISS-008 | Fabricated public claims live in production | HIGH | Content/Legal | FIXED |
| ISS-009 | Fulfilment loop — runs end to end; slots and order-state derivation remain | CRITICAL | Operations | PARTIAL |
| ISS-010 | COD collection and reconciliation missing | HIGH | Operations/Finance | OPEN |
| ISS-011 | Coupon engine is unreachable dead code | HIGH | Pricing | FIXED |
| ISS-012 | No error monitoring, uptime or analytics | HIGH | Observability | PARTIAL |
| ISS-013 | Zero test coverage on commerce-critical logic | HIGH | Testing | FIXED |
| ISS-014 | Order status transitions unvalidated | MEDIUM | Orders | PARTIAL |
| ISS-015 | No audit log on money/stock/price actions | HIGH | Security/Ops | PARTIAL |
| ISS-016 | Cart accepts quantities exceeding stock | MEDIUM | Cart | FIXED |
| ISS-017 | Legal pages missing; all footer links dead | HIGH | Legal | IN PROGRESS |
| ISS-018 | Canonical URLs and sitemap emit wrong host | MEDIUM | SEO/Config | PARTIAL |
| ISS-019 | Admin product management is read-only | HIGH | Admin | FIXED |
| ISS-020 | Search has no typo tolerance | MEDIUM | Search | OPEN |
| ISS-021 | Rate limiter fails open | MEDIUM | Security | FIXED |
| ISS-022 | No security headers or CSP | MEDIUM | Security | FIXED |
| ISS-023 | No CI pipeline | MEDIUM | DevOps | FIXED |
| ISS-024 | Migrations run automatically on production deploy | HIGH | DevOps | FIXED |
| ISS-025 | No refund entity or workflow | MEDIUM | Payments | OPEN |
| ISS-026 | No GST invoice generation | HIGH | Legal/Finance | BLOCKED (CA) |
| ISS-027 | Admin authorization via env allowlist only | MEDIUM | Security | OPEN |
| ISS-028 | Order numbers are non-sequential | LOW | Orders | OPEN |
| ISS-029 | Webhook handles only `payment.captured` | LOW | Payments | OPEN |
| ISS-030 | Free-delivery threshold hardcoded in source | LOW | Pricing | BLOCKED (OWNER) |
| ISS-031 | Three animation libraries shipped to mobile | LOW | Performance | OPEN |
| ISS-032 | Unit of measure stored as a display string | LOW | Data model | OPEN |
| ISS-033 | No product weight or dimensions | LOW | Data model | OPEN |
| ISS-034 | Rating fields exist with no review system | LOW | Catalog | OPEN |
| ISS-037 | Test suite ran against the application database | CRITICAL | Testing/Data | FIXED |
| ISS-038 | `font-sans` never resolved; site rendered in the system font | MEDIUM | Design system | FIXED |
| ISS-039 | Amber used as body text in ~148 places | MEDIUM | Design system | OPEN |
| ISS-040 | Production build fails intermittently on connection-pool exhaustion | HIGH | DevOps | FIXED |
| ISS-041 | Rate limiter was not atomic under concurrency | HIGH | Security | FIXED |
| ISS-042 | `rate_limits` rows are never reclaimed | LOW | Security/Data | OPEN |
| ISS-043 | Cleanup cron endpoint is unauthenticated and unscheduled | MEDIUM | Security/Operations | FIXED |
| ISS-044 | Third-party branded imagery presented as own-brand goods | CRITICAL | Legal/Content | PARTIAL |
| ISS-045 | `/categories/ceiling-fans-exhaust.webp` referenced but missing | MEDIUM | Content | PARTIAL |
| ISS-046 | Checkout, booking and admin still authenticate against Supabase after the Firebase migration | **CRITICAL** | Auth/Commerce | FIXED |
| ISS-047 | OTP abuse protection was lost in the Firebase migration; no App Check | HIGH | Security/Cost | OPEN |
| ISS-048 | Email/password sign-in has no password reset and no email verification | MEDIUM | Auth | FIXED |
| ISS-049 | A contested phone/email left a fully-authenticated customer with no account | **CRITICAL** | Auth | FIXED |
| ISS-050 | `www.verticalexpress.in` is not a Firebase authorized domain | **CRITICAL** | Auth/Config | FIXED |
| ISS-051 | `/api/health` disclosed configuration and raw database errors | MEDIUM | Security | FIXED |
| ISS-052 | SMS second-factor MFA is enabled project-wide with no client support | MEDIUM | Auth | FIXED |
| ISS-053 | Production has none of the 12 environment variables Firebase auth needs | **CRITICAL** | Config/Deploy | OPEN |
| ISS-054 | `SpeedChip` defaults to the unverified 60-minute delivery claim | MEDIUM | Content/Legal | FIXED |
| ISS-055 | Every delivered order paid 5% cashback at a rate nobody set | **CRITICAL** | Money/Policy | FIXED |
| ISS-056 | Two different fabricated GSTINs shipped as the company's registration | HIGH | Legal/Content | FIXED |
| ISS-057 | The Slots screen has no backing model — delivery windows do not exist | HIGH | Fulfilment | OPEN |
| ISS-058 | The storefront's default sort ranks by an always-empty `ratingCount` | MEDIUM | Catalog | PARTIAL |
| ISS-059 | `--color-danger` red is used for promotions and favourites, not just errors | MEDIUM | Design | PARTIAL |
| ISS-060 | Search has no query log, so "Searched most" and item requests cannot exist | LOW | Search | OPEN |
| ISS-061 | reCAPTCHA's callback was blocked by our own CSP, breaking phone sign-in | **HIGH** | Auth/Security | FIXED |
| ISS-062 | Nothing records what a product cost, so stock cannot be valued | HIGH | Catalog/Finance | OPEN |
| ISS-063 | Cash on delivery offered with no cash-handling operation behind it | HIGH | Fulfilment/Money | FIXED |
| ISS-064 | On-time performance reported against SLA targets nobody set | HIGH | Reporting | FIXED |
| ISS-065 | Marketing funnel and search demand were fabricated in the reporting service | HIGH | Reporting | FIXED |
| ISS-066 | Coupon usage, per-customer and first-N-orders limits were never enforced | HIGH | Money/Promotions | FIXED |
| ISS-067 | An unreachable services booking UI still carries free-visit and 24-hour promises | MEDIUM | Services/Dead code | OPEN |
| ISS-068 | A product's price can be set once and never changed | HIGH | Catalog | OPEN |

---

## ISS-001 — GST added on top of displayed prices

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Money / Tax |
| **Status** | FIXED (verified 25 Aug 2026) |

**Resolution.** `lib/services/tax.ts` treats prices as GST-inclusive and extracts tax from the
inclusive base. Intra-state J&K supply splits CGST/SGST; outside J&K uses IGST.
Per-category HSN and rate come from `CATEGORY_TAX_CONFIGS` (owner-confirmed,
Q2.2/Q2.3). Covered by four tests in `lib/services/__tests__/tax.test.ts`.

**Description.** `computeTotals()` takes the cart subtotal, calls `computeGst()` on it,
and adds the result: `totalPaise = taxableBase + gst.taxPaise + deliveryFeePaise`. The
product pages display prices as final retail figures (`₹320 per bag`). In Indian retail,
displayed prices are GST-**inclusive**. The customer therefore sees ₹320 and is charged
₹377.60.

Compounding this, `lib/services/tax.ts` is explicitly self-documented as demo mode: it
applies a flat 18% to every line regardless of category and uses a hardcoded placeholder
HSN code `7308` (structures of iron/steel) for all products including cement, paint and
plywood.

**Evidence.** `lib/services/checkout.ts:computeTotals` · `lib/services/tax.ts`
(`DEMO_GST_RATE = 0.18`, `DEMO_HSN_CODE = "7308"`, and its own header comment: *"This is
a demonstration tax engine, not a certified GST implementation… Before going live you
must replace this with per-item HSN-mapped rates and a real GSTIN."*) ·
`components/shop/checkout-view.tsx:242–245` renders GST as an added line.

**Likely files.** `lib/services/tax.ts` · `lib/services/checkout.ts` ·
`components/shop/checkout-view.tsx` · `components/shop/cart-view.tsx` ·
`prisma/schema.prisma` (add `hsnCode`, `taxRatePercent` to `Product`; add per-line tax
fields to `OrderItem`)

**User impact.** Every customer is overcharged by 18% at checkout after being shown a
lower price. This is the fastest possible way to destroy trust in a market that runs on
relationships.

**Business impact.** Incorrect tax collection and remittance. Invoices that will not
reconcile. Potential consumer-protection exposure for advertising one price and charging
another.

**Recommended fix.** Treat displayed prices as GST-inclusive (pending owner
confirmation — Owner Q4). Extract tax from the inclusive base rather than adding it:
`taxable = round(inclusive × 100 / (100 + rate))`, `tax = inclusive − taxable`. Move the
rate from a constant to `Product.taxRatePercent`, snapshot it onto `OrderItem` at order
time so a future rate change cannot rewrite an old invoice. Add real `hsnCode` per
product. Compute order tax as the **sum of already-rounded line taxes**, never as a
percentage of the subtotal. For CGST/SGST, compute one half and derive the other as the
remainder so the halves always sum exactly.

**Test required.** Every GST slab (5/12/18/28%) · inclusive vs exclusive · intra-state
(CGST+SGST) vs inter-state (IGST) · rounding at `.005` boundaries · property test that
`sum(line taxes) === order tax` · property test that CGST + SGST === total tax with no
lost or gained paise.

**Owner input required.** **YES** — whether prices are inclusive or exclusive (Q4), and
GST rate + HSN per category (Q4, requires CA).

---

## ISS-002 — Dummy payment gateway confirms orders with no money taken

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Payments / Production safety |
| **Status** | FIXED (verified 25 Aug 2026) |

**Resolution.** `lib/services/payments.ts` throws `PaymentConfigError` (`DUMMY_GATEWAY_IN_PRODUCTION`)
on every dummy-provider path when `isProduction()`, and `activeGateway()` refuses to
resolve `dummy` in production. It now fails loudly rather than pretending to work.

**Description.** `activeGateway()` returns `"dummy"` whenever `PAYMENT_GATEWAY` is not
`"razorpay"` or the Razorpay keys are absent. `DummyPaymentProvider.createPayment()`
returns `settled: true` with a fabricated `gatewayOrderId` and `gatewayPaymentId`. The
order is created with status `confirmed`, the payment row is written as `captured` with
`signatureVerified: true`, and **inventory is decremented — all with no money moving.**

**Evidence.** `lib/services/payments.ts` — `DummyPaymentProvider` returns
`{ settled: true, … }` unconditionally; `activeGateway()` falls back silently.
`lib/services/checkout.ts:placeOrder` sets `status: isCod || payResult.settled ?
"confirmed" : "pending_payment"` and `signatureVerified: payResult.settled`.
`.env.example` ships `PAYMENT_GATEWAY="dummy"`.

**Mitigating factor today.** The live site redirects `/checkout` to `/login` (verified:
HTTP 307 → `/login?next=%2Fcheckout`), so an anonymous visitor cannot reach it. That is
one Supabase signup away from being exploitable.

**Likely files.** `lib/services/payments.ts` · `actions/checkout.ts`

**User impact.** None directly — the customer receives goods they did not pay for.

**Business impact.** **Free orders. Direct, unbounded revenue loss.** Stock physically
leaves the godown against a payment record that is fabricated.

**Recommended fix.** `activeGateway()` must **throw** when
`process.env.NODE_ENV === "production"` and Razorpay keys are missing or
`PAYMENT_GATEWAY !== "razorpay"`. The dummy provider stays available for local
development and tests only. Add a startup assertion so the application refuses to boot
in production with a mock payment provider configured. Log loudly at boot which gateway
is active.

**Test required.** Unit test: `activeGateway()` throws under production env with no
keys · returns `dummy` under development · returns `razorpay` when keys present.
Integration test: order placement in a production-like env with no keys fails and
creates no order and no stock movement.

**Owner input required.** No, for the fix. **Yes for activation** — Razorpay merchant
account status (Q7).

---

## ISS-003 — Razorpay HTTP call executes inside the database transaction

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Checkout / Reliability |
| **Status** | FIXED (25 Aug 2026) |

**Resolution.** `provider.createOrder()` now runs before `db.$transaction` opens in
`lib/services/checkout.ts:placeOrder`; the transaction contains database work only.
The warehouse guard was also moved ahead of the gateway call, so a pincode that cannot
resolve to a warehouse fails without creating a gateway order at all. When the
transaction fails after a successful gateway call the gateway order is orphaned, which
is harmless — it is never captured and expires on Razorpay's side.

Covered by `lib/services/__tests__/checkout-transaction.test.ts`, which wraps
`db.$transaction` to count open transactions and stubs `fetch` to record the depth at
the moment the gateway is called. It asserts depth 0, and fails with `1 !== 0` against
the previous implementation. A second test asserts a gateway failure leaves no order
row and no stock movement.

**Description.** `placeOrder()` opens `db.$transaction(...)` and, as the first statement
inside it, calls `provider.createPayment()` — which for Razorpay performs an outbound
HTTPS request to `api.razorpay.com`. The database transaction, and its pooled
connection, are held open across arbitrary network latency.

**Evidence.** `lib/services/checkout.ts:placeOrder` — `await provider.createPayment(...)`
appears inside the `db.$transaction` callback. `lib/services/payments.ts` —
`RazorpayPaymentProvider.createPayment` uses `fetch()`.

**Likely files.** `lib/services/checkout.ts`

**User impact.** Under load or a slow gateway: checkout timeouts, failed orders, and a
customer who cannot tell whether their order went through.

**Business impact.** Connection-pool exhaustion under concurrent checkout takes down the
whole application, not just checkout. Transaction timeouts produce partial-looking
failures that are expensive to reconcile.

**Recommended fix.** Create the Razorpay order **before** opening the transaction, pass
the resulting `gatewayOrderId` in, and keep the transaction to database work only. If
the transaction then fails, the orphaned Razorpay order is harmless — it is never
captured and expires.

**Test required.** Assert no external I/O occurs within the transaction boundary (can be
asserted by injecting a provider stub that fails if called during the transaction).
Load test: 50 concurrent checkouts without pool exhaustion.

**Owner input required.** No.

---

## ISS-004 — Inventory decrement not scoped to a warehouse

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Inventory |
| **Status** | FIXED (verified 25 Aug 2026) |

**Resolution.** `lib/services/checkout.ts` resolves `warehouseId` from `ServiceablePincode` and the
stock decrement is scoped to it, refusing to proceed when it cannot be resolved.

**Description.** The stock decrement is
`tx.inventory.updateMany({ where: { variantId, ...(warehouse?.warehouseId ? { warehouseId } : {}), qtyOnHand: { gte: line.qty } }, … })`.
When `warehouse` is `null` — which happens whenever the address pincode has no matching
active `ServiceablePincode` row — the `warehouseId` filter is **omitted entirely** and
`updateMany` decrements that variant's stock at *every* warehouse simultaneously.

**Evidence.** `lib/services/checkout.ts:placeOrder`, the inventory loop. The guard
`if (res.count === 0) throw` catches zero matches but not multiple matches.

**Currently masked** by the seed containing exactly one warehouse ("Srinagar Central",
190001). It becomes silent data corruption the moment a second warehouse exists.

**Likely files.** `lib/services/checkout.ts`

**User impact.** Phantom stock-outs at warehouses that never sold the item.

**Business impact.** Silent inventory corruption. Stock figures that cannot be
reconciled against physical count, with no ledger to trace what happened.

**Recommended fix.** Make `warehouseId` mandatory. If no warehouse resolves for the
delivery pincode, the order must fail with `PINCODE_UNSERVICEABLE` before reaching the
transaction — which is arguably the correct behaviour anyway, since an unserviceable
address should not produce an order. Additionally assert `res.count === 1`, not
`res.count !== 0`.

**Test required.** Order to a pincode with no warehouse mapping → rejected, no order
created, no stock moved. Multi-warehouse fixture → only the resolved warehouse is
decremented.

**Owner input required.** No.

---

## ISS-005 — Payment capture amount is never verified

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Payments / Security |
| **Status** | FIXED (verified 25 Aug 2026) |

**Resolution.** The Razorpay webhook verifies the captured amount against the order total, rejects
mismatched, missing and non-integer amounts, leaves the order `pending_payment`, and
raises a FATAL alert. Seven tests in `lib/services/__tests__/webhook.test.ts`.

**Description.** `markOrderPaid()` looks up the order, checks it is
`pending_payment`, and marks it `confirmed` with `status: "captured"`. It never compares
the captured amount against `order.totalPaise`. Any successfully-signed capture for that
order confirms it, whatever the amount.

**Evidence.** `lib/services/checkout.ts:markOrderPaid` — no amount parameter is accepted
and no comparison is performed. `app/api/webhooks/razorpay/route.ts` extracts
`order_id` and `id` from the event payload but not `amount`.

**Likely files.** `lib/services/checkout.ts` · `app/api/webhooks/razorpay/route.ts`

**User impact.** None directly.

**Business impact.** An underpayment — from a gateway bug, a partial capture, or
manipulation — confirms a full order. This is the standard payment-integration mistake
and the standard fraud vector.

**Recommended fix.** Pass `amountPaise` from the webhook payload into `markOrderPaid`.
If it does not equal `order.totalPaise`, **do not confirm**. Flag the order for manual
finance review, write an audit entry, and alert. A mismatch is a bug or fraud signal,
never something to silently accept.

**Test required.** Webhook with correct amount → confirms. Webhook with lesser amount →
does not confirm, flags for review. Webhook with greater amount → does not confirm,
flags for review.

**Owner input required.** No.

---

## ISS-006 — Authentication uses email OTP, not phone

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Authentication |
| **Status** | OPEN — needs an SMS provider (D) |

**Description.** `getOtpChannel()` returns `"phone"` only if `AUTH_OTP_CHANNEL === "phone"`;
it defaults to `"email"`, and `.env.example` sets `AUTH_OTP_CHANNEL="email"`. The login
UI collects an email address. Worse, the code's own comment notes that on the Supabase
free tier the default template sends a **magic link, not a 6-digit code** — so the
promised "we'll send you a one-time code" is not what arrives.

**Evidence.** `lib/services/auth-provider.ts` — `getOtpChannel()` and the inline comment:
*"whether the email shows a LINK or a 6-digit CODE is controlled by the email TEMPLATE…
the free-tier default template sends a link."* Live site `/login` renders "Email address".

**Likely files.** `lib/services/auth-provider.ts` · `components/auth/login-form.tsx` ·
`actions/auth.ts` · Supabase dashboard configuration (not in repo)

**User impact.** Contractors and tradespeople in Srinagar transact by phone. Requiring an
email address at the moment of purchase — the point of maximum motivation — will lose a
large share of them outright. Many will not have an email address they check on site.

**Business impact.** Direct, unmeasured conversion loss at the highest-intent moment.

**Recommended fix.** The provider abstraction already supports this cleanly. Configure an
SMS provider (MSG91 or Twilio) in the Supabase dashboard, set `AUTH_OTP_CHANNEL="phone"`,
and change the login UI to a `+91` prefixed 10-digit numeric input with
`inputmode="numeric"` and `autocomplete="one-time-code"` on the OTP field. Validate
against `^[6-9]\d{9}$`. Keep email as a fallback channel, not the default.

**Test required.** OTP request rate limits enforced per phone and per IP · invalid Indian
mobile rejected · OTP expiry · attempt exhaustion invalidates the request · no OTP value
appears in logs or responses.

**Owner input required.** No for the code. **Yes for the provider account** — MSG91 or
Twilio, with Indian DLT template registration (which itself takes 3–5 days).

---

**Correction (30 Aug 2026).** The handover records that `AUTH_OTP_CHANNEL=phone` is "a
config flip, not code". It is not: that variable is read only by
`lib/services/auth-provider.ts`, **which nothing imports**. Setting it changes nothing.

The live path, `actions/auth.ts`, already selects the channel from the identifier —
`value.includes("@")` — and normalises a 10-digit number to E.164. So phone login needs
**no application code change at all**; both channels can work simultaneously. Five tests in
`auth-channel.test.ts` now pin that real behaviour, including that non-Indian-mobile
prefixes and wrong lengths are refused before any SMS is paid for. The four existing
`auth-provider.test.ts` tests are annotated as not covering the live path — they passed
while the module they test was unreachable, which is worse than no coverage.

**Progress (MSG91).** MSG91 is **not** natively supported by Supabase (MessageBird, Twilio,
Vonage and TextLocal are), so it needs a Send SMS Hook. Written:
`supabase/functions/send-sms-hook/index.ts` — verifies the Standard Webhooks signature,
calls MSG91, never logs the OTP, fails loudly when unconfigured. Setup documented in
`docs/PHONE_OTP_SETUP.md`.

**Blocked on the owner, and cannot be unblocked from here:**
1. **DLT registration** — sender ID and template must be pre-registered with an Indian DLT
   registry before any transactional SMS delivers. Days, plus business documents.
2. MSG91 account and authkey.
3. **Verifying the MSG91 request contract.** The call in the hook is written from their
   public v5 flow API but is NOT confirmed against a real request — their reference is
   behind a login. It is marked in the file and must be checked before going live.

## ISS-007 — The entire catalog is fictional

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Data |
| **Status** | **BLOCKED (OWNER)** |

**Progress, 12 September 2026 — the import path exists; the data is still the owner's.**

`/admin/listing` now takes a spreadsheet. Download a template, fill one row per product,
upload; the file is checked in full and shown before anything is written, and the write is
one transaction — all of it or none.

- `lib/catalogue-csv.ts` — pure parser, no database in reach. It carries a real RFC 4180
  reader rather than reusing `parsePincodeCsv`, because that one splits on a bare comma
  and most product titles here contain one (*"OPC 53 Grade Cement, 50 kg Bag"*).
- `lib/services/admin/catalogue-import.ts` — resolves brands, categories, warehouses and
  serviceable pincodes before the transaction opens, so an unknown one fails the file
  rather than half of it.
- `actions/catalogue.ts`, `components/admin/catalogue-import.tsx` — preview, then confirm.

Three deliberate departures from the recommended fix below:

| Recommended | Built | Why |
|---|---|---|
| SKU upsert | Existing products are **skipped and reported**, never updated | An import must not be a way to reprice something already in a customer's cart. Whether a price change may touch open carts is ISS-068, still open |
| Audit record carrying the file hash | One audit row per product created, inside the transaction | The per-product row is what an investigation actually needs; a file hash names a file nobody kept |
| `hsnCode`, `taxRatePercent` columns on `Product` | Not added | Stale. Tax comes from the category via `CATEGORY_TAX_CONFIGS`, and a per-product column would let a typo contradict owner-confirmed rates |

**This does not unblock the issue.** What the importer will not do is invent anything: it
creates no brand and no category, so a product can only be listed against something that
already exists. Which real brand a product belongs to is a fact about what is in the
warehouse. 44 tests cover the parser and the import.

**Description.** All 10 brands, all 45 products, all prices, all bulk tiers and all stock
figures in the database are invented. The brands are `BuildPro`, `AquaSeal`, `Voltix`,
`TimberCraft`, `GripFast`, `LumenX`, `SteelEdge`, `FlowMax`, `HomeCrown`, `PowerCell` —
none of which exist. The category structure closely mirrors HomeRun's, including a
`Fevicol` category that contains no Fevicol products.

**Evidence.** `prisma/seed.ts` — `const BRANDS = ["BuildPro", "AquaSeal", …]` and the
`PRODUCTS` array with invented `priceR` values. `/public/products/` contains ~6 real
product images; the remainder fall back to category images on the live PDP.

**Likely files.** `prisma/seed.ts` · new CSV import service · new admin product CRUD ·
`prisma/schema.prisma` (needs `hsnCode`, `taxRatePercent`, `weightGrams`)

**User impact.** Nothing on the site can be bought, because nothing on the site exists.

**Business impact.** Absolute launch blocker. Also a credibility problem — a contractor
who recognises that "BuildPro" is not a cement brand will not return.

**Recommended fix.** Build a CSV import pipeline with Zod row validation, a dry-run
report (`N create, N update, N errors with row numbers`), SKU upsert, rupee→paise
conversion on ingest, and an audit record carrying the file hash. Then import the
owner's real catalog. Delete seeded fictional data in the same migration. Delete
categories the owner is not stocking rather than showing empty shelves.

**Test required.** Valid file imports · a file with malformed rows reports them by row
number without blocking the file · re-importing the same file is idempotent · rupee to
paise conversion is exact.

**Owner input required.** **YES, blocking** — Q2 (categories, SKU count, real brands),
Q3 (where the data lives today and in what format), Q4 (pricing and GST).

---

## ISS-008 — Fabricated public claims live in production

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Content / Legal / Trust |
| **Status** | **BLOCKED (OWNER)** — owner must confirm which claims are real |

**Description.** The live production site carries multiple unverifiable or fabricated
claims:

| Claim | Location |
|---|---|
| **"recreated for educational purposes"** | `components/sections/footer.tsx:118` |
| Five named testimonials — Ravi Kumar (Hyderpora), Anita Sharma (Rajbagh), Mohammed Irfan (Lal Chowk), Deepa Nair (Nishat), Suresh Gowda (Bemina) | `lib/data.ts:TESTIMONIALS` |
| "Rated 4.9 on Google" (twice) | `lib/data.ts:TRUST_ITEMS`, testimonials section |
| "Loved by thousands of builders & homeowners" | trust badges |
| App Store and Google Play badges linking to `#` | `components/sections/app-banner.tsx` |
| "Track deliveries live, reorder in one tap, app-only offers" | app banner |
| Series-A-style funding banner | `components/sections/funding-banner.tsx` |
| "100% genuine brands, sourced directly" | trust badges |
| Services: "background-checked and skill-verified", "delay penalties written into every contract", "stage-wise quality checks with photo updates" | `app/services/page.tsx` |
| "Construction materials in 60 minutes" / "Avg. delivery 60 min" | hero |
| `hello@verticalexpress.co` — wrong TLD; site is `.in` | `lib/data.ts:CONTACT` |
| "Free delivery for first 3 orders above ₹500" | announcement bar — **and the coupon engine is dead code (ISS-011), so this cannot be honoured** |

**Evidence.** All verified in source and on the live site on 6 Aug 2026.

**Likely files.** `lib/data.ts` · `components/sections/footer.tsx` ·
`components/sections/testimonials.tsx` · `components/sections/trust-badges.tsx` ·
`components/sections/app-banner.tsx` · `components/sections/funding-banner.tsx` ·
`components/sections/hero.tsx` · `app/services/page.tsx`

**User impact.** The "educational purposes" line tells every visitor the site is not a
real business, undermining every other claim on the page.

**Business impact.** **Legal exposure.** Fabricated testimonials attributed to named
individuals in named localities, and a fabricated Google rating, are actionable under
Indian consumer-protection law and the ASCI code. Unverified "authorised dealer" and
"background-checked professional" claims carry similar risk. Advertising apps that do
not exist is a further exposure.

**Recommended fix.** Remove every claim the owner does not confirm as real and provable.
Delete the funding banner and the app banner outright. Replace testimonials with real
ones once collected, or remove the section. Fix the contact email TLD. Add a real phone
number — a local trade business with no visible phone number will not be trusted.

**Test required.** A content lint or test asserting the string "educational purposes"
does not appear anywhere in the built output.

---

### ISS-008 / ISS-044 addendum — Login hero brand names in text (31 Aug 2026, FIXED)

The login hero (`components/auth/login-hero.tsx`) rendered six third-party brand names
as visible text in addition to using their product photography. The on-screen labels
read: "ACC Suraksha Power", "Dr. Fixit Pidiproof LW+ 101", "Polycab Optima+",
"Asian Paints Tractor Uno", "Asian Paints SmartCare", "Loctite General Purpose Sealant".
None of these products exist in the Vertical Express catalogue and no authorisation was
held for the marks or photography.

The remediation pass (ISS-044) initially tracked only the image references and missed
the text labels — a gap discovered and corrected in the same session. The component was
replaced with six generic material categories (CEMENT / WATERPROOFING / ELECTRICAL /
PAINT / HARDWARE / PLUMBING) using the neutral placeholder image. No manufacturer name
appears in any rendered content. Status: **FIXED**.

**Owner input required.** **YES, blocking** — Q1 (contact details), Q10 Part A (per-claim
confirmation).

---

## ISS-009 — The fulfilment loop does not exist

**Progress (26 Aug 2026).** The data model now exists. Migration
`20260826095435_add_shipments` adds `Shipment` and `ShipmentItem`, and
`placeOrder` records the split inside the order transaction using the same
`Category.isBulk` rule the storefront shows on every product card — so the split
a customer is told about is the split that is written.

**Progress (5 Sep 2026). The loop now runs end to end.** `Shipment` had been
write-once for its entire life — created at `pending` in the checkout
transaction and never advanced, with no `shipment.update` anywhere outside a
test comment. What landed:

- `lib/shipment-flow.ts` — the state machine. Separate from `lib/order-flow.ts`
  because an order mixing wire with cement has two shipments that move
  independently, and one status cannot describe both.
- `lib/services/admin/shipments-write.ts` — `advanceShipment`, `assignShipment`,
  `confirmDelivery`. Every write is an `updateMany` guarded on the status that
  was read, with the audit row in the same transaction, and restocks on cancel.
- `Driver` and `Vehicle` (migration `20260905061559_drivers_vehicles`), plus
  `lib/services/admin/roster-write.ts` to create and retire them. Nobody is ever
  deleted — a driver who carried shipments is referenced by every one of them.
- The dispatch board assigns, packs, dispatches, cancels and confirms, with a
  third lane for what is already on the road.
- **The pick list.** What to collect from the shelves, aggregated by item rather than
  listed per shipment — four shipments of the same cement is one trip to that aisle, not
  four. It cannot say *where* anything is: `Inventory` records a warehouse, not a bin.
- **The packing slip.** The document that travels with the goods, and the last
  piece this entry named as missing. One per shipment, with a tick column so the
  customer can check the load at the gate, and "Shipment 1 of 2" so somebody
  receiving half an order is not left assuming the rest is lost. It deliberately
  omits two things: the **delivery code**, because printing the handover proof and
  putting it in the box hands it to whoever is carrying the parcel; and the
  **registered business name and address**, which are still unconfirmed and were
  removed from the order document for the same reason in `677d08a`. It says on its
  face that it is not a tax invoice and carries no GSTIN or HSN codes.
- **Proof of delivery.** The six-digit code is issued once at dispatch,
  compared in constant time, capped at five attempts per shipment per fifteen
  minutes failing closed, and never written to a log, an error or the audit
  trail. A wrong code, a missing shipment and one not out for delivery all
  return the same answer.

`dispatchedAt`, `deliveredAt`, `deliveryCode`, `driverId` and `vehicleId` are
all written now. **56 tests across nine files** cover the loop — the write path (20),
the roster (8), the dispatch board (4), the pick list (5), the packing slip (6), and
the shipment read services (13) — and every guard was verified to fail when the defect
it catches was put back.

`npm run db:demo` now seeds the fulfilment side too — three drivers, two vehicles
and fourteen shipments across the demo orders, with one order split in two so
"Shipment 1 of 2" is visible, three orders left at `confirmed` drawing from a
narrow set of variants so the pick list has something to aggregate, and the
handover codes printed at the end so proof of delivery can be tried. Until this,
the demo database held thirteen orders and **zero** shipments, so every screen
described above rendered empty to anyone who signed in to look at it.

**Still missing, and still not faked in the UI:**

- **Slot selection.** No `Slot` model (ISS-057), which is why the board has
  three lanes rather than the artboard's five and why `promisedAt` stays null.
- **Deriving order state from shipment state.** Deliberate:
  `Order.status` remains authoritative and shipments are recorded alongside it,
  per the expand/migrate/contract rule in CLAUDE.md. Contracting is a later
  release.
- **Cash held per driver.** Needs COD collection and reconciliation (ISS-010).

**Owner input required.** Three rules were built as mechanisms and need a
decision: whether dispatch may ever proceed without a driver assigned; when an
operator may use "Delivered, no code", which records `proof: "none"` against
`proof: "delivery_code"`; and whether a customer should see the driver's phone
number or only their name.

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Operations |
| **Status** | **MOSTLY RESOLVED** — the warehouse-to-doorstep loop runs end to end; slots, order-state derivation and driver cash remain |

**Description (as originally written, 6 Aug 2026).** The order chain runs
`cart → checkout → order → confirmed` and stops. There is no `Shipment`, no `Driver`, no
assignment, no dispatch board, no pick list, no packing slip, no delivery OTP, and no
proof of delivery. An admin can manually click an order through
`confirmed → packed → out_for_delivery → delivered`, but no operational system sits
behind those clicks.

**What of that is still true (5 Sep 2026).** Almost none of it. `Shipment`, `Driver`,
`Vehicle`, assignment, the dispatch board, the delivery code, proof of delivery, the pick
list and **the packing slip** all exist — see the progress note above. Of the eight nouns
that paragraph says are missing, every one has been built. What remains missing is what
it does not mention: slot selection (ISS-057), and cash per driver (ISS-010).
The original paragraph is kept rather than rewritten because the shape of the gap it
describes is why the rest of this entry reads as it does; leaving it unmarked would have
made it the fourth stale claim found in this register in a week.

**Evidence (corrected 3 Sep 2026).** The original line here read "no shipment, driver,
or POD entity exists", and it stayed after `Shipment` landed — the Progress note above
was added, the Evidence below it was not. That is the kind of drift that makes a register
worse than no register, so what follows is what the code actually says today.

`Shipment` and `ShipmentItem` have existed since `20260826095435_add_shipments`, along
with `ShipmentStatus` and `SpeedClass`. Shipments are created inside the checkout
transaction by `lib/services/shipments.ts:createShipmentsForOrder()` and read by
`getDispatchBoard()` and `lib/services/admin/today.ts`.

**But the write path is one-way.** A repo-wide search finds no `shipment.update` or
`shipment.updateMany` outside tests, and no shipment action in `actions/`. Every shipment
is created at `pending` and can never leave it, so the dispatch board accumulates rows
forever. `deliveryCode` is a column that is never written and `promisedAt` is always null.

Still absent entirely: `Driver`, any vehicle model, any delivery-slot or capacity model
(ISS-057), and any proof of delivery. `app/admin/orders/page.tsx` +
`components/admin/status-control.tsx` still provide only an order-level status dropdown,
which is decoupled from shipment state by design during the expand phase.

So the accurate summary is: the data model for shipments exists and is populated; the
operational loop around it does not.

**Likely files.** `prisma/schema.prisma` (new `Shipment`, `Driver` models) ·
`lib/services/` (new fulfilment service) · `app/admin/orders/dispatch/` (new) ·
`actions/admin.ts`

**User impact.** No dispatch notification, no delivery window, no proof the order was
delivered, no way to resolve a dispute about whether goods arrived.

**Business impact.** **Operations cannot run the business from the software.** Every
order would be tracked on paper or WhatsApp, which does not scale past a handful of
orders per day and produces no record.

**Recommended fix.** Add `Shipment` (order, driver, status, assignedAt, dispatchedAt,
deliveredAt, deliveryOtp, podImageUrl, per-line delivered quantity) and `Driver` (name,
phone, vehicle type, active). Build an admin dispatch board: ready-for-dispatch queue,
assign driver, mark dispatched. Generate a delivery OTP on dispatch, send it to the
customer, and require it to close the order. Support partial fulfilment with automatic
refund or COD-amount reduction. Printable pick list and packing slip.

**Deliberately out of scope for P0A:** live GPS tracking, route optimisation, automated
driver assignment. Manual dispatch is correct below ~30 orders/day.

**Test required.** Full lifecycle confirmed → picked → packed → dispatched → delivered
with OTP · partial fulfilment refund arithmetic · failed delivery and reattempt · an
order cannot close without OTP verification.

**Owner input required.** **YES for design** — Q8 (who performs each step, on what
device). If one person does all eleven steps, this should be one screen, not three.

---

## ISS-010 — COD collection and reconciliation missing

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Operations / Finance |
| **Status** | OPEN |

**Description.** COD orders can be placed (gated on `ServiceablePincode.codAllowed`) but
there is no record of cash collected, no per-driver cash position, no deposit tracking,
and no discrepancy detection. There is also **no COD value cap of any kind** — a customer
can place a ₹5,00,000 COD order.

**Evidence.** `prisma/schema.prisma` — no COD entity. `lib/services/checkout.ts` — COD
is accepted with only the `codAllowed` boolean check.

**Likely files.** `prisma/schema.prisma` (`CodCollection`, `CodDeposit`) ·
`lib/services/` (new) · `app/admin/orders/cod-reconciliation/` (new) ·
`lib/services/checkout.ts` (eligibility rules)

**User impact.** Minimal directly — but a customer whose cash payment is not recorded
will be chased for money they already paid.

**Business impact.** **Untracked cash is the most common quiet loss in hyperlocal
commerce.** With COD likely a large share of GMV, unrecorded collection is a direct and
unbounded risk. The absent value cap is a separate, serious exposure.

**Recommended fix.** Add `CodCollection` (order, driver, expected, collected,
discrepancy, collectedAt) and `CodDeposit` (driver, amount, reference, depositedAt,
verifiedBy). Admin view: per driver per day — expected, collected, deposited,
outstanding, discrepancy. A discrepancy blocks order closure. A driver over a
configurable outstanding-cash threshold cannot be assigned new COD orders. Add COD
eligibility rules: maximum order value, lower cap for first-time customers, and a block
after repeated refusals.

**Test required.** Reconciliation arithmetic exact to the paise · discrepancy blocks
closure · outstanding threshold blocks assignment · each COD denial reason returns its
own message.

**Owner input required.** **YES** — Q7 (COD limits, who collects, who reconciles).

---

## ISS-011 — Coupon engine is unreachable dead code

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Pricing |
| **Status** | FIXED |

**Description.** A complete `Coupon` model exists (type, value, minimum order, usage
limits, per-user limits, first-N-orders, date window) and `Cart` carries a `couponId`
foreign key. But `computeTotals()` sets `const discountPaise = 0;` unconditionally. No
coupon can ever apply. Meanwhile the announcement bar advertises *"Free delivery for
first 3 orders above ₹500"*.

**Evidence.** `lib/services/checkout.ts:computeTotals` — `const discountPaise = 0;` ·
`prisma/schema.prisma:Coupon` · `lib/data.ts:ANNOUNCEMENTS`

**Likely files.** `lib/services/checkout.ts` · `lib/services/cart.ts` ·
`prisma/schema.prisma` (needs a `CouponRedemption` table for per-user usage tracking)

**User impact.** An advertised offer that silently does nothing.

**Business impact.** A public promise the software cannot honour.

**Recommended fix.** Either wire the coupon engine (resolve `Cart.couponId`, validate
every rule server-side, apply `discountPaise` before tax, add a `CouponRedemption` table
with a unique constraint on `(couponId, orderId)` for usage tracking) **or** remove the
advertising claim until it is wired. Do not leave both in place. Every rejection must
return a specific reason, never a generic failure.

**Test required.** Each rejection path returns its own message · per-user limit enforced
under concurrency · usage count increments exactly once per order · a code cannot apply
twice to one order.

**Owner input required.** Only to confirm the promotion is real (Q10).

---

**Correction (30 Aug 2026).** "Unreachable dead code" understated it. The path was
reachable and actively misleading: `validateCoupon` returned discounted totals, the UI
announced "Coupon applied!" and showed the reduced figure — then `placeOrder` was called
without the code. `computeTotals` received `undefined`, `discountPaise` came back 0, and
the customer was charged full price for the total they had just been shown as discounted.
Severity raised MEDIUM → HIGH: a customer seeing one price and being charged another is
the failure class CLAUDE.md ranks above all others.

**Resolution.** `couponCode` is threaded UI → action → `placeOrder` → `computeTotals`. The
client sends the CODE, never a discount figure; the server re-resolves the coupon and
recomputes the total, so a tampered client cannot mint a discount. `Order.couponCode` — a
column that existed but was never written — now records which coupon produced the
discount.

Three end-to-end tests pin it, the first being the one that would have caught the bug:
the discount shown must equal the discount charged. Verified by stashing the fix: the test
fails without it and passes with it.

**Not covered.** `usageLimit`, `perUserLimit` and `firstNOrders` exist on `Coupon` and are
still not enforced — a coupon can be redeemed more often than intended. Tracked separately
rather than folded in silently.

## ISS-012 — No error monitoring, uptime checking or analytics

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Observability |
| **Status** | PARTIAL (verified 3 Sep 2026) |

**Update.** The wiring exists; the credentials do not. `@sentry/nextjs` and `posthog-js`
are dependencies, `lib/observability/index.ts` initialises both, and
`instrumentation.ts` calls `initSentry()` at server boot. Both degrade to no-ops when
their keys are unset, which is what they are in production today.

So the remaining work is configuration rather than engineering: set `SENTRY_DSN` and the
PostHog key in Vercel. Uptime checking is still genuinely absent — nothing polls the site
from outside, so a total outage is still discovered by a customer.

**The evidence below was true when written and is not now.**

**Description.** No Sentry, no uptime monitoring, no logging infrastructure, no GA4, no
product analytics. The homepage HTML contains zero third-party scripts.

**Evidence.** `package.json` — no observability dependencies. Live homepage HTML —
no `gtag`, `googletagmanager`, `sentry`, `posthog` or `facebook` strings.

**Likely files.** `package.json` · `sentry.*.config.ts` (new) · `app/layout.tsx` ·
`next.config.ts`

**User impact.** A broken checkout stays broken until a customer complains.

**Business impact.** Blind to revenue-affecting breakage, and blind to the conversion
funnel. There is no way to know whether the serviceability check or the OTP step is
losing customers.

**Recommended fix.** Sentry first — errors and performance, with PII scrubbing and
source maps. Uptime checks on home, PDP, checkout and a health endpoint. Route only three
alerts to SMS: site down, checkout failing, payment webhook failing. Everything else
waits until morning — alert fatigue is a real failure mode for a small team. Analytics
(GA4 + PostHog) can follow at P0B.

**Test required.** A deliberately triggered error appears in Sentry with a readable
stack trace and no PII. A simulated outage alerts within 2 minutes.

**Owner input required.** No.

---

## ISS-013 — Zero test coverage on commerce-critical logic

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Testing |
| **Status** | FIXED (verified 25 Aug 2026) |

**Resolution.** 67 tests across 11 files covering GST, checkout maths, coupons, cart inventory,
webhook amount verification and idempotency, payments, search, observability and BI.
Enforced by CI (ISS-023). Coverage is not exhaustive — fulfilment and invoicing have
no tests because they have no code yet.

**Description.** There are no tests of any kind. No Vitest, Jest, Playwright or Testing
Library. No `.test.*` or `.spec.*` files. No `.github/` directory.

**Evidence.** Full repository scan — zero matches.

**Uncovered, and each capable of losing money:** bulk tier price resolution · money
conversion and formatting · GST computation · cart totals and free-delivery threshold ·
inventory decrement under concurrency · order idempotency (double-submit, P2002 race) ·
webhook signature verification and dedupe · serviceability resolution · OTP rate
limiting · address ownership enforcement.

**Likely files.** `vitest.config.ts` (new) · `playwright.config.ts` (new) ·
`lib/services/__tests__/` (new) · `.github/workflows/ci.yml` (new)

**User impact.** Indirect but severe — regressions reach production silently.

**Business impact.** **This is the single largest risk multiplier in the project.** The
codebase contains careful, subtle correctness work — the `gte` stock guard, the P2002
idempotency catch, the timing-safe HMAC comparison. None of it is protected. Any future
change can silently break it, and the failure mode is lost money.

**Recommended fix.** Vitest for unit and integration (with a real Postgres via
Testcontainers or a dedicated test database — inventory concurrency cannot be tested
against a mock). Playwright for the critical purchase journey. Minimum suite before
launch: tier pricing boundaries · GST across slabs and rounding · money round-trip
properties · 50 concurrent `placeOrder` against limited stock yielding exactly N sold ·
double-submit with one `idempotencyKey` yielding one order · duplicate webhook
`event.id` as a no-op · browse → cart → login → COD order → confirmation.

**Test required.** *This issue is the tests.*

**Owner input required.** No.

---

## ISS-014 — Order status transitions are unvalidated

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Orders |
| **Status** | OPEN |

**Description.** The admin status control writes any `OrderStatus` value with no
validation of whether the transition is legal. `delivered → pending_payment` is accepted.

**Evidence.** `components/admin/status-control.tsx` · `actions/admin.ts` — no transition
map or guard.

**Likely files.** `lib/services/orders.ts` · `actions/admin.ts` ·
`components/admin/status-control.tsx`

**User impact.** A customer can see an order regress to an earlier state.

**Business impact.** Corrupt order state, unreliable reporting, and no way to trust the
status field for reconciliation.

**Recommended fix.** Define an explicit `ALLOWED: Record<OrderStatus, OrderStatus[]>`
map and validate every transition against it in the service layer, not the UI. Throw
`InvalidTransitionError` on violation. Write an `OrderStatusEvent` for every transition
(already modelled) and an `AuditLog` row (ISS-015).

**Test required.** Every valid transition succeeds; every invalid transition is rejected.

**Owner input required.** No.

---

## ISS-015 — No audit log on money, stock or price actions

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Security / Operations |
| **Status** | OPEN |

**Description.** Admin actions that affect money, stock, prices or order state leave no
trace beyond `OrderStatusEvent` (which covers only order transitions). There is no record
of who changed a price, who adjusted stock, who issued a refund, or who suspended a
pincode.

**Evidence.** `prisma/schema.prisma` — no audit entity. `actions/admin.ts` — no audit
writes.

**Likely files.** `prisma/schema.prisma` (new `AuditLog`) · `lib/services/audit.ts`
(new) · every admin mutation path

**User impact.** None directly.

**Business impact.** No forensic capability. When stock or cash goes missing, there is no
way to determine what happened. Insider risk is unmitigated and undetectable.

**Recommended fix.** Add an insert-only `AuditLog` (actorType, actorId, action,
entityType, entityId, before, after, ip, createdAt). Write a row **in the same
transaction** as every price change, inventory adjustment, order transition, refund,
coupon change, and staff role change. No exceptions for "minor" actions.

**Test required.** Every admin mutation produces exactly one audit row with correct
before/after values.

**Resolution (30 Aug 2026) — PARTIAL.** `AuditLog` (append-only) and `lib/services/audit.ts`
added, with `recordAudit(tx, entry)` taking the transaction client so the audit row shares
the mutation's fate. An audit written after the fact goes missing exactly when something
has gone wrong; this cannot.

**Update (2 Sep 2026).** Serviceability joins the audited paths. `savePincode` and
`bulkSavePincodes` write an `AuditLog` row inside the same transaction as the change, and
`/admin/serviceability` shows the recent history on the screen — editing that table changes
what a customer is promised, and "who put the delivery fee up" now has an answer without
opening a log aggregator. Only the fields that actually moved are recorded; a whole-row
diff buries the one number that changed among the ones that did not. Inventory adjustment
(`StockMovement`) and coupon changes are covered too. Still uncovered: refunds and staff
role changes.

Wired today: order status changes, inventory release on admin cancellation, booking status
changes. Five tests cover one-row-per-mutation, correct before/after, no row on a refused
transition, and — the load-bearing one — that a row does not survive a rolled-back
transaction.

**Why PARTIAL.** The issue also asks for price changes, refunds, coupon changes and staff
role changes. None of those mutation paths exist yet: admin product management is
read-only (ISS-019), there is no refund entity (ISS-025), and there is no staff model
(ISS-027). Each must call `recordAudit` in the same transaction when it is built. This
issue closes when ISS-019, ISS-025 and ISS-027 land audited.

**Found while wiring.** `advanceBookingStatus` took no actor, ran no transaction, and never
called `nextBookingStatuses` — the validation existed but was dead, so any booking could
jump to any status, including backwards or straight to completed. Now validated,
transactional and audited, matching how orders already worked. (Relates to ISS-014.)

**Owner input required.** No.

---

## ISS-016 — Cart accepts quantities exceeding available stock

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Cart |
| **Status** | FIXED |

**Description.** `getCartSummary()` computes an `inStock` boolean per line, but
`addItem()` validates only that the variant exists and is active — it never checks
availability. A customer can add 500 units of an item with 3 in stock and only discover
the problem at checkout.

**Evidence.** `lib/services/cart.ts:addItem` — checks `isActive` only.
`updateItemQty` caps at 999 with no stock reference.

**Likely files.** `lib/services/cart.ts`

**User impact.** Wasted time and a frustrating late failure at the most committed moment.

**Business impact.** Checkout abandonment at the point of highest intent.

**Recommended fix.** Check availability in `addItem` and `updateItemQty` and cap at
available quantity with a clear message ("Only 3 left — quantity set to 3"). Keep the
checkout-time enforcement as the authoritative guard; this is a UX improvement, not a
replacement for it.

**Test required.** Add beyond stock → capped with message · update beyond stock → capped ·
checkout still rejects if stock changed after add.

**Owner input required.** No.

---

**Correction (30 Aug 2026).** This was already fixed in code and the register was stale.
`lib/services/cart.ts` throws `ONLY_X_LEFT` and `OUT_OF_STOCK`, and seven tests in
`cart-inventory.test.ts` cover add, update and cart-refresh clamping. Found by verifying
the register against the code rather than trusting it — the third stale entry so far.

## ISS-017 — Legal pages missing; every footer link is dead

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Legal / Compliance |
| **Status** | **BLOCKED (LEGAL)** |

**Description.** All nine footer links use `href="#"`. `/about`, `/contact`, `/faq`,
`/price-lists` and all `/policies/*` routes return 404 on the live site. There is no
Refund Policy, Privacy Policy, Terms of Service, Shipping Policy or Contact page.

**Evidence.** `lib/data.ts:FOOTER_LINKS` — every entry is `href: "#"`. Live probes:
`/faq`, `/about`, `/contact`, `/price-lists` all HTTP 404.

**Likely files.** `lib/data.ts` · `app/(content)/` (new routes)

**User impact.** No way to find out the return policy, how data is handled, or how to
contact the business.

**Business impact.** **Taking online payments in India without published refund, privacy,
terms and shipping policies is a compliance failure.** Razorpay's own merchant onboarding
requires these to be live. This blocks payment activation, not just launch.

**Recommended fix.** Write and route all six pages. Content must reflect what operations
can actually do — a 24-hour return window that nobody can service is worse than an honest
7-day one. Have them reviewed before publishing.

**Test required.** Every footer link resolves to a 200. A route test asserting no
`href="#"` remains in the footer.

**Owner input required.** **YES** — Q7 (cancellation/refund process), Q10 (returns
window and non-returnable categories), Q1 (business identity for the contact page).
Legal review recommended.

---

## ISS-018 — Canonical URLs and sitemap emit the wrong host

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | SEO / Configuration |
| **Status** | OPEN |

**Description.** `NEXT_PUBLIC_SITE_URL` is misconfigured in production. Canonical tags,
Open Graph URLs, Open Graph images and every one of the 68 sitemap entries emit
`https://new-virticalexpress.vercel.app` instead of `https://www.verticalexpress.in`.
`robots.txt` points the sitemap at the same wrong host.

**Evidence.** Live PDP `canonical: https://new-virticalexpress.vercel.app/product/…` ·
`sitemap.xml` — all 68 `<loc>` entries on the vercel.app host · `robots.txt` —
`Sitemap: https://new-virticalexpress.vercel.app/sitemap.xml`

**Likely files.** Vercel environment configuration (not in repo) · `app/sitemap.ts` ·
`app/robots.ts` · `app/layout.tsx`

**User impact.** Link previews shared on WhatsApp — the primary sharing channel in this
market — display a `vercel.app` staging URL, which looks unprofessional and untrustworthy.

**Business impact.** Search engines are told the canonical version of every page lives on
a different domain, splitting or suppressing ranking signals for the real domain.

**Recommended fix.** Set `NEXT_PUBLIC_SITE_URL=https://www.verticalexpress.in` in the
Vercel production environment. Add a build-time assertion that the value does not contain
`vercel.app` when `NODE_ENV=production`.

**Test required.** Build-time assertion. A test that sitemap entries and canonical tags
use the configured production host.

**Owner input required.** Only Q1 — confirm `verticalexpress.in` is the final domain.

---

## ISS-019 — Admin product management is read-only

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Admin |
| **Status** | FIXED (verified 3 Sep 2026) |

**Resolution.** The catalogue is operable from the console. `actions/listing.ts`
(`adminListProduct`) creates a product, its first variant and its stock row in one
transaction, with the opening quantity written to the stock ledger; `/admin/listing` is
the screen. `actions/products.ts` (`adminSaveProduct`) edits name, slug, status, brand
and delivery speed. `actions/inventory.ts` (`adminAdjustStock`) adjusts stock behind a
race-free conditional update, every change carrying a reason and an actor.
`actions/brands.ts`, `actions/coupons.ts`, `actions/serviceability.ts` and
`actions/settings.ts` cover the rest. Covered by `product-create.test.ts`,
`product-editor-authority.test.ts`, `stock-adjust.test.ts` and `coupon-admin.test.ts`.

Two things deliberately remain read-only, and are not part of this issue: **price** is
server-authoritative and is not editable from a form, and **image upload** needs an
object store that does not exist — a URL field accepting anything typed into it is how a
manufacturer's photography reaches the catalogue without a licence (ISS-044).

**The description below is retained as written and is no longer accurate.**

**Description.** `/admin/products` lists products. There is no create, no edit, no image
upload, no activate/deactivate, no price change, and no stock adjustment. The only way to
change the catalog is to edit `prisma/seed.ts` and re-run the seed.

**Evidence.** `app/admin/products/page.tsx` — list rendering only. No product mutations
in `actions/admin.ts`.

**Likely files.** `app/admin/products/` · `actions/admin.ts` · `lib/services/catalog.ts`

**User impact.** None directly.

**Business impact.** **The owner cannot run their own catalog.** Every price change,
every new product, every stock correction would require a developer and a deployment.
This is not operable.

**Recommended fix.** Full product CRUD: create, edit, variant management, image upload
to Supabase Storage, activate/deactivate, price change (audit-logged), and stock
adjustment with a mandatory reason code. Plus the CSV import from ISS-007.

**Test required.** Create product → appears on storefront and in search · price change →
reflected within the ISR window and audit-logged · image upload validates type and magic
bytes · stock adjustment writes a movement record.

**Owner input required.** No for the build. Q3 informs whether CSV import or manual entry
is the primary path.

---

## ISS-020 — Search has no typo tolerance

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Search |
| **Status** | OPEN |

**Description.** Search uses Postgres `ILIKE '%q%'` across product title and brand name
only. It does not search descriptions, SKUs, categories or synonyms, and it has no typo
tolerance. **Verified on the live site: `/search?q=cementt` returns "0 products".**

**Evidence.** `lib/services/search.ts:getSuggestions` — `contains` with
`mode: "insensitive"`. Live probe confirmed zero results for a single-character typo.

**Likely files.** `lib/services/search.ts` · new migration for `pg_trgm` · new synonym
table

**User impact.** Construction buyers search badly on purpose — trade names, brand-as-category,
transliterations, abbreviations, and typos on a phone keyboard while standing on a site.
`sariya` for TMT steel, `tanki` for water tank, `sement` for cement, `paip` for pipe.
Every failed search is a lost sale.

**Business impact.** Directly lost revenue, and no visibility into what customers wanted
that we do not stock.

**Recommended fix.** Enable the `pg_trgm` extension, add a GIN trigram index, and use
similarity matching alongside `ILIKE`. Add a curated synonym table seeded with local
trade vocabulary. Log every zero-result query for weekly review — that review is a
20-minute task with outsized returns, and it also tells the owner what to stock next.
**Do not add Typesense or Algolia at 45 SKUs** (see `DECISIONS.md` DEC-011).

**Test required.** `sement`, `cementt`, `plywod`, `sariya`, `tanki` all return sensible
results · zero-result queries are logged.

**Owner input required.** Q3 informs the synonym seed — the owner knows what customers
actually call things.

---

## ISS-021 — Rate limiter fails open

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Security |
| **Status** | **FIXED** — `failClosed` option added; the OTP bucket sets it |

**Description.** `rateLimit()` wraps its logic in a try/catch that returns
`{ allowed: true }` on any error. The comment explains the intent — never block a
legitimate user because the limiter table is unreachable — which is correct for most
endpoints and wrong for the OTP endpoint specifically.

**Evidence.** `lib/services/rate-limit.ts` — `catch { return { allowed: true, retryAfterMs: 0 }; }`

**Likely files.** `lib/services/rate-limit.ts` · `actions/auth.ts`

**User impact.** A victim could be OTP-bombed if the limiter table is unavailable.

**Business impact.** Uncapped SMS spend once phone OTP is live (ISS-006), plus the
reputational cost of being the vector for harassment.

**Recommended fix.** Add a `failClosed` option. Default remains fail-open; the OTP
request path sets `failClosed: true`. Also add cost alerting on SMS spend once the
provider is live.

**Test required.** Limiter error on a fail-open bucket → allowed · limiter error on the
OTP bucket → denied.

**Owner input required.** No.

**Resolution.** `rateLimit()` takes a fourth `options` argument with `failClosed`,
defaulting to `false` so search, serviceability and booking keep failing open — correct
for them. `actions/auth.ts` passes `failClosed: true` for the OTP bucket, per DEC-016.
A limiter outage there now denies with a full-window `retryAfterMs` instead of allowing.
Covered by `lib/services/__tests__/rate-limit.test.ts`, including a test that asserts the
OTP caller actually passes the option — the limiter being correct is useless if its one
critical caller forgets to ask for it.

**Fixed in.** `lib/services/rate-limit.ts` · `actions/auth.ts`

---

## ISS-022 — No security headers or Content Security Policy

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Security |
| **Status** | **FIXED** — full header set enforced; CSP is not nonce-based, by owner decision |

**Description.** `next.config.ts` defines no `headers()`. There is no CSP, no
`X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no
`X-Frame-Options`/`frame-ancestors`. Vercel supplies HSTS; nothing else is set.

**Evidence.** `next.config.ts` — only `outputFileTracingRoot` and `turbopack`. Live
response headers show HSTS only.

**Likely files.** `next.config.ts` · `middleware.ts`

**User impact.** Increased exposure to XSS and clickjacking.

**Business impact.** Standard hardening absent on a site that will handle payments and
PII under the DPDP Act.

**Recommended fix.** Add a full header set: nonce-based CSP (allowing
`checkout.razorpay.com` and the Supabase origin), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera
and microphone, `frame-ancestors 'none'`. Verify no `unsafe-inline` for scripts.

**Test required.** A header-presence test in CI; target grade A on securityheaders.com.

**Owner input required.** No.

**Resolution.** `next.config.ts` now exports a function of the build **phase** and returns
`headers()` for `/(.*)`: a Content Security Policy, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera,
microphone, geolocation and browsing-topics, and `X-Frame-Options: DENY` alongside CSP
`frame-ancestors 'none'`. HSTS continues to come from Vercel.

**Amended 25 Sep 2026 (owner-approved, Web Completion Batch 2 / W-15).** Geolocation is
now `geolocation=(self)`: the storefront's own "Use my location" needs it, and the
blanket deny blocked it on every page (the recommendation above named only camera and
microphone). No embedded frame or other origin may ask, and the browser still prompts
the customer. `security-headers.test.ts` asserts `self` only — no wildcard, no other
origin — and still asserts camera, microphone and browsing-topics are denied.

**Deviation from the recommendation above, owner-approved.** The CSP is deliberately
**not** nonce-based. Next applies nonces during server-side rendering, so a nonce forces
every page to render dynamically and "Static optimization and Incremental Static
Regeneration (ISR) are disabled". That would cost all 96 prerendered pages, which is the
wrong trade on mid-tier Android over degrading 4G. `script-src` therefore carries
`'unsafe-inline'`, which is also what covers the three JSON-LD blocks — their content is
dynamic, so a static hash cannot. The single executable inline script the app shipped (the
invoice print handler) was replaced with a client component, so no application code
depends on `'unsafe-inline'` any more.

`https://*.razorpay.com` is allowed in `script-src`, `frame-src`, `connect-src` and
`img-src`. The wildcard is deliberate: Razorpay publishes no authoritative CSP host list,
and browser verification showed the payment modal frame loads from **`api.razorpay.com`**,
not `checkout.razorpay.com` — a host-specific policy would have silently broken payment.

**Verified.** Production build emits the correct policy (no `'unsafe-eval'`, no `ws:`,
`upgrade-insecure-requests` present) and still prerenders 96/96 pages. In a browser:
`checkout.razorpay.com/v1/checkout.js` loads and `window.Razorpay` is a function; the
modal iframe loads from `api.razorpay.com` with zero CSP violations; JSON-LD parses on
home and product pages; home, product, cart, login and services report no violations.

**Not verified — blocked.** A fully rendered Razorpay payment modal, which needs a real
key (ISS-002 refuses to boot a production server on the dummy gateway), and the invoice
print button, which sits behind authentication.

**Fixed in.** `next.config.ts` · `app/(account)/account/orders/[orderNo]/invoice/page.tsx`
· `components/account/print-invoice-button.tsx`

---

## ISS-023 — No CI pipeline

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | DevOps |
| **Status** | FIXED (25 Aug 2026) |

**Resolution.** `.github/workflows/ci.yml` runs on every push and pull request:
`npm ci`, migrations and seed against a throwaway Postgres 17 service container,
then `npx tsc --noEmit`, `npm run lint` and `npm test`. Branch protection on `main`
requiring this check is still worth turning on in GitHub settings.

**Description.** No `.github/` directory. Nothing gates a push. Typecheck, lint and
(once they exist) tests are never enforced automatically.

**Evidence.** Repository scan — no `.github/`.

**Likely files.** `.github/workflows/ci.yml` (new)

**Business impact.** Broken code can reach production. With no tests and no CI, the only
gate is a human remembering to run two commands.

**Recommended fix.** GitHub Actions on pull request and push to main: install, typecheck,
lint, secret scan (gitleaks), unit and integration tests, and a migration reversibility
check. Branch protection on `main` requiring the check to pass — even for solo work,
especially for solo work.

**Test required.** CI runs green on a trivial PR and red on a deliberate type error.

**Owner input required.** No.

---

## ISS-024 — Migrations run automatically on every production deploy

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | DevOps |
| **Status** | OPEN |

**Description.** `vercel-build` is `prisma generate && prisma migrate deploy && next build`.
Every production deployment applies pending migrations automatically, with no gate, no
review step, no staging rehearsal, and no rollback path. There is also no staging
environment.

**Evidence.** `package.json:scripts.vercel-build`. No staging configuration found.

**Likely files.** `package.json` · CI workflow · deployment documentation

**Business impact.** A failed migration mid-deploy leaves the production database in an
unknown state with no rehearsed recovery. On a database holding orders and payments, this
is the highest-consequence operational risk in the project.

**Resolution (30 Aug 2026).** `vercel-build` no longer writes to the database. It runs
`scripts/predeploy-migrations.mjs`, which calls `prisma migrate status` and **fails the
build** when migrations are pending, printing the command to apply them.

Dropping `migrate deploy` on its own was not enough: a deploy could then ship code
expecting a column the database lacks, moving the failure from build time to runtime in
front of customers. Asking rather than writing catches that at build time instead.

Applying migrations is now a deliberate act — `npm run db:deploy`, run by a person who is
watching. `npm run db:status` reports without changing anything. `ALLOW_AUTO_MIGRATE=1`
restores the old behaviour for a genuine emergency and warns loudly when used.

Verified against a throwaway database: pending migrations exit 1, up-to-date exits 0.

**Still open:** there is no staging environment, so migrations are still rehearsed only
against a local database rather than a production-like one.

**Recommended fix.** Remove `migrate deploy` from `vercel-build`. Run migrations as an
explicit, reviewed step against staging first, then production. Take a manual snapshot
before any migration touching orders, payments or inventory. Document the rollback path.
Set up a Supabase branch database for staging. Perform and document at least one restore
drill — a backup that has never been restored is a hypothesis, not a backup.

**Test required.** Migration up and down verified in CI against a disposable database.

**Owner input required.** No.

---

## ISS-025 — No refund entity or workflow

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Payments |
| **Status** | OPEN |

**Description.** `PaymentStatus` includes `refunded` and `OrderStatus` includes
`refund_initiated` and `refunded`, but there is no refund entity, no partial-refund
support, no Razorpay refund API call, and no COD refund path.

**Evidence.** `prisma/schema.prisma` — enum values with no supporting model or service.

**Likely files.** `prisma/schema.prisma` (new `Refund`) · `lib/services/payments.ts` ·
`app/admin/refunds/` (new)

**Business impact.** Refunds would be issued manually outside the system with no audit
trail and no reconciliation against the payment record.

**Recommended fix.** Add a `Refund` model (order, payment, amount, reason, type, status,
providerRefundId, bankDetails for COD, initiatedBy). Implement `refund()` on the payment
provider interface. Separation of duties: support requests, finance approves. Idempotent,
audit-logged, with a customer notification carrying a realistic timeline.

**Test required.** Full and partial refund · idempotent retry · COD refund path · provider
failure retries then alerts.

**Owner input required.** **YES** — Q7 (refund process and who approves).

---

**Update 2026-09-20 — partial (money is no longer silently lost).** A payment that
Razorpay captures *after* the order was cancelled (typically the 15-minute expiry
cron) is now recorded explicitly instead of leaving `captured` money against an
order that looks normal: `settleCapturedPayment` (`lib/services/checkout.ts`)
marks the payment `captured`, does **not** resurrect the order, writes one order
event ("Payment received after this order expired. Under review for refund."),
raises the `late_payment_captured` alert, and the pair *(payment captured, order
cancelled)* is the refund-required worklist, readable through
`listCapturedPaymentsOnDeadOrders()`. The client callback answers `409` with
`metadata.reason = "LATE_PAYMENT"`. **No refund is initiated or claimed.**
`refund_initiated` / `refunded` remain unreachable (see `lib/order-flow.ts`).
Still open and the owner's call: refund policy, who authorises, a `Refund` entity,
an operator screen over the worklist, and whether/when to call `refundPayment`.
Tests: `lib/services/__tests__/payment-settlement.test.ts`.

## ISS-026 — No GST invoice generation

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Legal / Finance |
| **Status** | **BLOCKED (CA)** |

**Description.** No invoice PDF, no invoice number, no invoice storage. `Order` has no
invoice fields. B2B customers cannot claim input credit, and the business has no
compliant document trail.

**Evidence.** `prisma/schema.prisma:Order` — no `invoiceNumber` or `invoiceUrl`. No
invoice service.

**Likely files.** `prisma/schema.prisma` · `lib/services/invoice.ts` (new) · Supabase
Storage

**Business impact.** GST-registered buyers — contractors and institutions, the highest-value
segment — require a compliant invoice. Without one they cannot buy.

**Recommended fix.** Generate a PDF containing seller name/address/GSTIN, buyer
name/address/GSTIN, invoice number, date, place of supply, per-line HSN, quantity, rate,
taxable value, CGST/SGST or IGST, totals in figures and words, and a signature block.
Sequential, gapless invoice numbering from a database sequence. Store in Supabase Storage
behind a short-lived signed URL. **The format must be approved by the owner's CA before
launch.**

**Test required.** Invoice arithmetic reconciles to the order total to the paise ·
numbering is gapless under concurrent order creation.

**Owner input required.** **YES** — Q1 (GSTIN), Q4 (rates and HSN). **Requires CA sign-off
on the format.**

---

## ISS-027 — Admin authorization via environment allowlist only

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Security |
| **Status** | OPEN |

**Description.** `getAdminUser()` checks the authenticated email against a
comma-separated `ADMIN_EMAILS` environment variable. There are no roles, no 2FA, and no
re-authentication for sensitive actions — despite a `Role` enum (`customer`, `admin`,
`vendor`, `professional`) already existing in the schema and going unused.

**Evidence.** `lib/services/admin/authz.ts` · `prisma/schema.prisma:Role` — declared,
never referenced in authorization.

**Verified 5 Sep 2026 — the mechanism is sound; the policy is what is thin.**
Checked all three ways into the console rather than assuming:

- **Pages.** `app/admin/layout.tsx` calls `adminGate()` and redirects. A layout wraps every
  route beneath it, so the twenty-six pages correctly do *not* repeat the check. A sweep
  that flags each page as "ungated" is reading the wrong thing.
- **Server actions.** All thirteen `admin*` actions call `getAdminUser()` before doing any
  work and return FORBIDDEN. A layout cannot cover these — an action is reachable by POST
  with no page rendered.
- **Route handlers.** There are no admin ones. The four public handlers are public by
  design; the two privileged ones carry a shared secret or a verified signature.

`getAdminUser()` also refuses an unverified email, which is load-bearing under Firebase in
a way it was not under Supabase: email/password sign-up sets `email` on the token before
anyone proves they can read that inbox, so allowlisting an unverified address would let
anybody sign up as an address in `ADMIN_EMAILS` and walk in. The empty allowlist fails
closed.

**The gap a test now covers:** a new route handler under `app/api` touching admin data
would be protected by nothing, and nothing would have said so.
`lib/__tests__/admin-authorization.test.ts` fails if one appears — verified by adding one.

**The trade-off, which is the owner's and is why `User.role` stays unused.** Moving admin
membership into the database removes the redeploy needed to add an operator. It also means
anybody who can write the database can make themselves an operator, which an environment
variable does not allow — that needs deploy access. With one operator the env var is
arguably the safer of the two. The question is worth asking again the day there is a second
person, and granular roles (operations, warehouse, catalog, finance) describe a team that
does not exist yet; inventing that taxonomy now would be building the wrong thing.

**Likely files.** `lib/services/admin/authz.ts` · `app/admin/layout.tsx` ·
`prisma/schema.prisma`

**Business impact.** Every admin has full power over prices, stock, orders and refunds.
Adding or removing an operator requires a redeploy. No separation of duties between the
person who requests a refund and the person who approves it.

**Recommended fix.** Use the existing `Role` enum. Add granular roles as the team grows
(operations, warehouse, catalog, finance). Require TOTP 2FA for admin accounts. Enforce
separation of duties on refunds. Combine with the audit log (ISS-015).

**Test required.** A table-driven test iterating every role against every sensitive
endpoint.

**Owner input required.** Q8 — how many people, and in what roles.

---

## Lower-severity issues

| ID | Title | Area | Detail | Fix | Owner input |
|---|---|---|---|---|---|
| **ISS-028** | Order numbers non-sequential | Orders | `orderNumber()` uses `Date.now().toString(36)` + random hex → `VE-2026-M8X2A1F4`. Hard to read over the phone; gaps look like missing orders to an accountant. | Sequential per year from a Postgres sequence: `VE-2026-000123`. Keep the unique constraint. | No |
| **ISS-029** | Webhook handles only `payment.captured` | Payments | `payment.failed`, `refund.processed`, `order.paid` are ignored. | Handle failure (release order), refund confirmation, and add a reconciliation poller for orders stuck in `pending_payment` >20 min. | No |
| **ISS-030** | Free-delivery threshold hardcoded | Pricing | `FREE_DELIVERY_THRESHOLD_PAISE = 50000` (₹500) is a constant in source. | Move to configuration. **The value itself is a guess.** | **YES — Q6** |
| **ISS-031** | Three animation libraries shipped | Performance | `framer-motion` + `gsap` + `lenis` all in the bundle, plus a welcome-popup interstitial. `lenis` hijacks native scroll, which degrades perceived performance on low-end Android and breaks scroll anchoring. | Remove `lenis` and `gsap`, keep `framer-motion`. Remove the welcome popup. Audit `next/image` usage. | No |
| **ISS-032** | UoM stored as a display string | Data model | `Product.unitLabel` is `"per bag"` — a string. Cannot compute ₹/kg, cannot validate quantity steps, cannot prevent "0.5 bags of cement". | Structured `uom` enum + `packSize` + `packUnit` + `minOrderQty` + `qtyStep`. (This is the same class of bug that makes HomeRun render `₹0.0/`.) | Q2/Q3 |
| **ISS-033** | No product weight or dimensions | Data model | Cannot compute delivery fee by weight, cannot determine vehicle class, cannot flag heavy-material handling. | Add `weightGrams` and optional dimensions to `ProductVariant`. | Q2 |
| **ISS-034** | Rating fields with no review system | Catalog | `Product.ratingAvg` and `ratingCount` are seeded with values but no review submission, storage or moderation exists. | Either build reviews (P1) or stop displaying seeded ratings — displaying a fabricated rating is the same problem as ISS-008. | No |
| **ISS-035** | OTP endpoint reveals account existence | Security | Error text differs depending on whether the identifier is known. | Return an identical response regardless. | No |
| **ISS-036** | Repository hygiene | DevOps | `.vercel-old/` is committed. Entire history is one squashed commit, making `git bisect` and blame useless. No Prettier config. | Remove `.vercel-old/`, add Prettier, commit incrementally from here. | No |

---

## Issues resolved

*None yet. Move issues here with the resolving commit SHA and date as they are fixed.*

---

## ISS-037 — Test suite ran against the application database

| | |
|---|---|
| **Severity** | CRITICAL |
| **Area** | Testing/Data |
| **Status** | FIXED (25 Aug 2026) |

**Description.** `npm test` resolved `DATABASE_URL` from `.env` — the same remote
Supabase database the application uses. The suite is not read-only: it creates orders,
payments, webhook events and inventory rows, and mutates order status. Running it wrote
`TEST-ORDER-*` records into that database.

**Evidence.** `package.json` test script carried no env-file flag; Prisma Client loads
`.env` automatically; a full run produced orders named `TEST-ORDER-<timestamp>` and
payment rows. `.env` `DATABASE_URL` host resolves to a Supabase project.

**Business impact.** Test data mixed into real data. Any suite that touches inventory
could decrement real stock. It also made CI impossible to enable safely — every push
would have written to the live database.

**Secondary finding.** Eight tests (cart inventory, search synonyms) were passing only
because they read seed data that happened to exist in the shared database. Against a
clean database they failed with *"No categories found in seed to attach test product
to."* Isolation exposed a real gap in test setup, now closed by seeding as part of
`db:test:setup`.

**Resolution.**
- `test-support/db-guard.mjs` — loaded via `node --import` before Prisma is
  instantiated. Refuses to run unless `VE_TEST_DATABASE=1`, and refuses managed
  database hosts (Supabase, Neon, RDS, Railway, Render, PlanetScale) unless
  `VE_TEST_DATABASE_ALLOW_REMOTE=1` is also set. Never prints the connection string.
- `.env.test` (gitignored) plus `.env.test.example` — the suite loads its own env file
  via `--env-file-if-exists`, which takes precedence over `.env` because Prisma's dotenv
  loading does not override already-set variables.
- `scripts/setup-test-db.sh` (`npm run db:test:setup`) — creates the local database,
  creates no-login equivalents of the Supabase roles the RLS lockdown migration grants
  to, applies migrations and seeds. `--reset` drops first.
- CI uses a throwaway Postgres 17 service container with the same guard active.

**Side effect worth noting.** Against local Postgres the suite runs in **0.96s** rather
than **50.2s** — a 52× improvement, which is what makes running it on every push
practical.

**Test required.** Removing `.env.test` makes `npm test` refuse to run rather than fall
through to `.env`. Verified.

**Owner input required.** Yes — one question. `TEST-ORDER-*` rows and their payments
exist in the Supabase database from previous runs. If that project is production they
should be identified and removed, and any reporting that counted them re-checked.

---

## ISS-038 — `font-sans` never resolved; the site rendered in the system font

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Design system |
| **Status** | FIXED (25 Aug 2026) |

**Description.** `app/globals.css` declared `--font-sans: var(--font-inter), …` inside a
plain `@theme` block. Tailwind v4 resolves `@theme` values at `:root`, but next/font
defines `--font-inter` on `<body>`. The reference could not resolve, so `--font-sans`
fell back to Tailwind's default stack and every page rendered in `ui-sans-serif` —
the system font — not the brand face. The webfont was downloaded on every page load
and never used.

**Evidence.** In the browser: `getComputedStyle(document.body).fontFamily` returned
`ui-sans-serif, system-ui, sans-serif, …` while `--font-jakarta` was present on `<body>`
and 25 font faces were registered. `getPropertyValue("--font-sans")` on `:root` was
empty.

**Resolution.** The font token moved to an `@theme inline` block, which substitutes at
the point of use instead of emitting a `:root` variable, so the `font-sans` utility
resolves. Because `@theme inline` emits no custom property, the raw `body` rule now
reads `var(--font-jakarta)` directly. Verified: 40 of 40 sampled elements compute to
`"Plus Jakarta Sans"`.

**Note.** This was pre-existing and unrelated to the palette change — it would have
applied equally to Inter. It was found only because the font swap prompted a check of
what the browser actually computed.

---

## ISS-039 — Amber is used as body text in ~148 places

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Design system / Accessibility |
| **Status** | OPEN |

**Description.** `text-brand` appears 148 times across 56 components. The design system
states that amber never carries body text: `#EDAF1C` on white is 1.75:1 and fails WCAG
AA at any size. Amber is for fills, the brand mark, the speed bolt, ticks and large
numerals; ink carries every piece of text that has to be read.

**Evidence.** A contrast sweep of the rendered home page found amber text at 12px, e.g.
testimonial attributions ("Ravi Kumar", "Anita Sharma") at 1.75:1.

**Not a regression.** The previous gold `#FCBD00` has near-identical luminance and failed
identically. The token repoint changed the hue, not the contrast.

**Complication.** Many of the 148 are `text-brand` on an SVG icon, which the system
permits — amber is legitimate for marks. Icon and text usages cannot be separated by
grep, so this needs a component-by-component pass rather than a find-and-replace.

**Mitigation already scheduled.** Several of the worst offenders live in sections due for
deletion as launch blockers: `testimonials.tsx`, `trust-badges.tsx`, `app-banner.tsx`
(ISS-008). Whatever remains should be swept afterwards.

**Test required.** A contrast assertion over rendered pages, or a lint rule banning
`text-brand` on non-SVG elements.

**Owner input required.** No.

---

---

## Phase 2 note — operations console (25 Aug 2026)

The admin area was five read-mostly pages behind a top nav. It is now a console with a
grouped sidebar and eleven screens: Today, Orders, Order detail, Products, Inventory,
Customers, Payments, Serviceability, Coupons, Reports.

**Built only against data that exists.** The canvas design also specifies a dispatch
board, pick-and-pack, driver POD, COD cash reconciliation, GST invoicing, a stock
movement ledger, purchasing and goods receipt, suppliers, support tickets and credit.
None of those are here, because none of `Shipment`, `Batch`, `StockMovement`, `Invoice`,
`CashCollection`, `PurchaseOrder`, `Supplier`, `Ticket` or a credit model exist in the
schema. A panel that renders a plausible number from nothing is worse than an absent
panel.

**Deliberately read-only, with the reason stated on each screen:**

- *Inventory* — no `StockMovement`, so an adjustment would change stock with no reason,
  reference or actor recorded. That is the gap ISS-015 describes; adjustment ships with
  the ledger.
- *Products* — editing needs `hsnCode` and `gstRate` per product, which the schema does
  not carry. An invoice cannot legally be raised without them (ISS-019, ISS-026).
- *Serviceability* — this table decides whether an order can be taken, what delivery
  costs and whether COD is offered. Editing it changes what customers are promised, so
  it needs an audit trail first (ISS-015).

**Verified during the build:** the order status machine in `lib/services/admin/manage.ts`
already validates transitions and throws `INVALID_TRANSITION`, so ISS-014 is partially
addressed for the admin path — the customer-facing paths were not audited.

**Also noted:** `/admin/bookings` still exists but is no longer linked from the sidebar.
Services operations leave with verticalconstruction.in (owner decision), so that route
should be retired with the rest of the services split rather than left orphaned.

**Ops-only status palette.** Five states — neutral, info, warn, bad, ok — added as
`--color-ops-*` tokens. They are for `/admin` only and must never appear on a
customer-facing surface, where the palette is ink, amber and grey with no green or red.
Every chip carries a word as well as a colour.

---

---

## Gap audit before Phase 3 (25 Aug 2026)

A sweep of Phases 1 and 2 found the Phase 1 claim removal was incomplete — it covered
the desktop sections and page metadata but not the mobile views or `lib/data.ts`.

**Closed in this pass:** `TRUST_ITEMS` (carried the 4.9 Google rating and a "100%
genuine" assurance, unreferenced but still in source), orphaned `TESTIMONIALS` data and
its type, a "FASTEST DELIVERY" badge on the mobile home view, emoji in the cart banner,
mobile greeting, both error pages and two admin buttons.

**ISS-018 partially closed:** `robots.ts` and `sitemap.ts` fell back to
`https://verticalexpress.dev` (wrong TLD) and `metadataBase` to `localhost:3001`. The
fallbacks now point at `https://www.verticalexpress.in`. **Still open** because the real
fix is setting `NEXT_PUBLIC_SITE_URL` in the deployment — a fallback is a safety net,
not a configuration.

**Also fixed:** `CONTACT.email` was `hello@verticalexpress.co` — the wrong TLD, rendered
in the footer as the site's contact route.

**`.env.example` was missing six variables the code reads** — `RESEND_API_KEY`,
`EMAIL_FROM`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`,
`NEXT_PUBLIC_POSTHOG_HOST`. All three services no-op when unset, so transactional email,
error monitoring and analytics were silently inert with nothing to indicate it.

**Raised, not actioned — needs the owner.** `lib/services.ts` publishes statistics on
the services page: "500+ Projects Completed", "250+ Verified Professionals", "1000+
Happy Customers", "50+ Service Categories", plus a claim that every professional is
"background-checked and skill-verified". These are the same class as the removed 4.9
rating, but unlike that one they could be true. They were left in place pending
confirmation rather than deleted.

**Build fragility noted.** `next/font` fetches Plus Jakarta Sans from Google Fonts at
build time; a build with no network access to Google Fonts fails outright. Observed once
during this pass. Worth self-hosting the face before it bites a deploy.

---


## ISS-040 — Production build fails intermittently on connection-pool exhaustion

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | DevOps / Build |
| **Status** | FIXED (26 Aug 2026) |

**Description.** `next build` prerenders every published product page via
`generateStaticParams` — 96 static pages today. `DATABASE_URL` points at the Supabase
pgbouncer pooler with `connection_limit=5` and a 10s pool timeout. At Next's default
static-generation concurrency the build opened more concurrent Prisma queries than the
pool allows and pages failed with *"Timed out fetching a new connection from the
connection pool"*.

**Evidence.** Three consecutive builds each failed on a **different** product page
(`exterior-emulsion-20l`, `pvc-conduit-25mm-3m`, `inverter-battery-combo`) — the
signature of pool exhaustion rather than a bad page.

**Business impact.** `vercel-build` runs `next build`, so this is an intermittently
failing deploy. It would present as "the deploy randomly fails, retry usually works",
which is expensive to diagnose under pressure.

**Resolution.** `experimental.staticGenerationMaxConcurrency: 2` in `next.config.ts`,
holding prerender concurrency below the connection limit so queued pages wait on the
scheduler rather than racing for a connection, plus `staticGenerationRetryCount: 2` for
a genuinely slow response. A page that fails twice still fails the build — the retry
does not mask real errors.

**Rejected approach.** Switching the Prisma client to `DIRECT_URL` during
`NEXT_PHASE=phase-production-build` was tried first and made it **worse** — 13 pool
errors instead of 3, and the home page began failing. Reverted. The direct connection
is not a drop-in substitute for the pooler here.

**Note on raising the ceiling instead.** The concurrency cap is the safe fix inside the
repository. Raising `connection_limit` on the build-time DSN would also work and would
build faster, but that is the owner's Vercel environment to change, and a higher limit
has runtime consequences for serverless.

**Test required.** Two consecutive clean builds reaching `Generating static pages
(96/96)` with zero `prisma:error` lines. Verified.

**Owner input required.** No.

---

---

## ISS-041 — Rate limiter was not atomic under concurrency

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Security |
| **Status** | **FIXED** |

> **Numbering note.** The owner asked for this to be filed as ISS-027. That number was
> already taken by *Admin authorization via env allowlist only*, so it was filed here
> instead rather than overwrite a live security entry.

**Description.** Found while fixing ISS-021, and not previously catalogued. `rateLimit()`
read the current window with `findUnique` and then wrote it with a separate `update` or
`upsert`. That is a read-modify-write race: concurrent callers all read the same `hits`,
all evaluated themselves as under the limit, and all proceeded.

**Evidence.** A test against the old implementation: **20 concurrent calls against a limit
of 5 allowed all 20**. The failure is not a partial leak but a total one — every caller
took the "no row yet" branch and reset the window, so the limiter did nothing at all under
a cold burst.

**User impact.** The limiter's stated protection did not exist in the exact circumstance it
was written for. A burst is what a limiter is *for*; a limiter that only holds under
sequential traffic is decorative.

**Business impact.** Compounds ISS-021. Once phone OTP is live (ISS-006), a concurrent
burst against one number bypasses the 5-per-15-minutes cap entirely — uncapped SMS spend
and a harassment vector, with the per-message cost paid by us.

**Resolution.** The read and the write are now one statement — `INSERT ... ON CONFLICT
(bucket) DO UPDATE ... RETURNING` — so concurrent callers serialise on the row lock. All
time arithmetic moved into the database (`LOCALTIMESTAMP`) as part of the same fix: the
first attempt passed JavaScript `Date` values into `$queryRaw` against a
`TIMESTAMP`-without-time-zone column, and the two ends disagreed about the time zone. On
an IST machine that skewed the window by 5h30m, which would have made an active window
look long expired and reset the counter on nearly every call.

**Test.** `lib/services/__tests__/rate-limit.test.ts` — 20 concurrent calls against a limit
of 5 allow exactly 5. Confirmed to fail against the previous implementation before the fix
was applied.

**Fixed in.** `lib/services/rate-limit.ts`

---

## ISS-042 — `rate_limits` rows are never reclaimed

| | |
|---|---|
| **Severity** | LOW |
| **Area** | Security/Data |
| **Status** | OPEN |

**Description.** Noticed while fixing ISS-021 and ISS-041; pre-existing and not made worse
by that work. Nothing ever deletes from `rate_limits`. The table gains a permanent row per
distinct bucket key, and two of the four buckets are keyed by client IP
(`svc:${ip}`, `search:${ip}`), so the row count grows with unique visitors and never falls.

**Evidence.** `lib/services/rate-limit.ts` writes only. No cleanup job, cron or TTL exists
anywhere in the repository.

**User impact.** None today.

**Business impact.** Slow unbounded growth in a Supabase table, and gradually slower index
lookups on a query that sits in the OTP and search paths. Immaterial at launch volume;
worth closing before it is measured in millions of rows.

**Recommended fix.** A periodic delete of rows whose `window_start` is older than the
longest window in use (currently one hour). A Vercel cron calling a small route handler is
sufficient — this does not justify adding a job runner (DEC-011 defers Inngest).

**Test required.** Rows older than the retention horizon are removed; rows inside an active
window are not.

**Owner input required.** No.

---

## ISS-043 — Cleanup cron endpoint is unauthenticated and unscheduled

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Security/Operations |
| **Status** | **FIXED** |

**Description.** Found during the production-configuration review, and not previously
catalogued. `GET /api/cron/cleanup-orders` cancels expired `pending_payment` orders and
returns their stock to inventory. It shipped with **no authentication of any kind** — no
secret, no token, no header check — and `middleware.ts` does not gate it, because
`PROTECTED_PREFIXES` covers only `/account`, `/checkout` and `/admin`. Separately, no
`vercel.json` existed, so **the job was never scheduled and never ran**.

**Evidence.** `app/api/cron/cleanup-orders/route.ts` — a bare `export async function GET()`
taking no request argument. `cleanupExpiredPendingOrders` had exactly one caller: this
route. No `crons` configuration existed anywhere in the repository.

**User impact.** The security half was bounded: the endpoint accepts **no inputs**, so an
attacker could not name an order, target a customer, or widen the 15-minute window — only
orders already eligible for cancellation were ever touched, and the status-guarded
`updateMany` prevented double-release. The realistic harm was denial of service: an
unauthenticated, unthrottled endpoint opening up to 20 interactive transactions per call
against a pooler sized at `connection_limit=5`.

**Business impact.** The unscheduled half was the more damaging one. `placeOrder` decrements
inventory when an order is created, and nothing returned it. Every abandoned checkout would
have held its stock permanently, so sellable quantity would drain with no matching sales and
no physical count could ever reconcile.

**Resolution.** The route now authenticates with `CRON_SECRET`, which Vercel sends
automatically as an `Authorization: Bearer …` header on every cron invocation — the
platform's own mechanism, so no new dependency or bespoke scheme. Comparison is
timing-safe. It **fails closed**: an unset `CRON_SECRET` denies rather than allows,
following the same reasoning accepted for the OTP limiter in DEC-016. The check runs before
any database access, so an unauthorised caller cannot generate pool load. A `vercel.json`
schedules the job every 5 minutes (owner decision, 31 Aug 2026); this requires a Pro plan,
as Hobby caps cron at once per day and **fails deployment** on a more frequent expression.

**`cleanupExpiredPendingOrders` was not modified.** It was already transactional per order
and already idempotent via its `status: 'pending_payment'` guard, which is exactly what
Vercel's documented "cron delivery may miss or duplicate runs" requirement demands. The
idempotency and concurrency tests below assert that pre-existing behaviour and passed
without any change to it.

**Test.** `lib/services/__tests__/cron-cleanup.test.ts` — 8 tests: missing header, wrong
token, bare secret without the `Bearer` scheme, and unset secret all return 401 while
mutating nothing; an authorised call cancels and releases exactly the ordered quantity;
an order inside the window survives; repeated and concurrent authorised runs release stock
exactly once and write exactly one status event.

**Owner input required.** Answered — every 5 minutes, 15-minute expiry window unchanged.

**Production requirement.** `CRON_SECRET` must be set in Vercel Production (Sensitive,
≥16 random characters). Until it is, the endpoint fails closed and the cleanup does not run.

**Fixed in.** `app/api/cron/cleanup-orders/route.ts` · `vercel.json`

---

## ISS-044 — Third-party branded imagery and category fallback defects in catalogue

| | |
|---|---|
| **Severity** | **HIGH** |
| **Area** | Catalogue / Legal / Brand Assets |
| **Status** | **PARTIALLY RESOLVED — Product-level rows verified correct in production (31 Aug 2026); Phase 3 residuals remain** |

**Description.** The storefront catalogue referenced real manufacturers' product photography
and category composite images carrying prominent third-party trademarks under fictional
Vertical Express branding without authorisation. Products without their own photo fell back
to category composites, and two products referenced a missing asset
(`/categories/ceiling-fans-exhaust.webp`), rendering broken images.

**Code fixes completed (branch `fix/brand-imagery-remediation`, 31 Aug 2026).**
- 5 branded product files deleted from `public/products/`.
- 6 branded hero images deleted from `public/hero/`.
- Neutral placeholder (`public/placeholder-product.webp`) generated and committed.
- `prisma/seed.ts` fallback changed from category composites to the placeholder; `update` branch leaves `ProductImage` untouched (§9/§20).
- `components/sections/hero.tsx` and `components/auth/login-hero.tsx` rewritten to use generic material categories — no manufacturer names in text or image sources.
- `lib/data.ts` DEALS entries repointed to placeholder.
- Asset guard (`scripts/check-assets.mjs`) installed to enforce provenance and prevent regressions in CI.
- `docs/ASSET_PROVENANCE.md` created as the authoritative registry of asset origins.

**Production database state — verified 2026-08-31T07:35:50Z.**

Owner approved the gated 29-row `ProductImage.url` write on 31 Aug 2026. On dry-run, the supervised remediation script (`scripts/remediate-product-images-iss044.mjs`) confirmed identity reconciliation passed for all 29 rows (correct database) but found all 29 rows **already carrying `/placeholder-product.webp`**. The branded URLs were gone before the gated script ran. The `--execute` write was therefore not performed — the state was already correct and the in-transaction URL precondition would have blocked it regardless.

The most probable cause is that `prisma db seed` was run against the production database during an earlier session while commit `2a3b9d7`'s `updateMany` block was active in `prisma/seed.ts`. That block updated every primary `ProductImage` to `p.image ?? PRODUCT_PLACEHOLDER`, which for the 29 branded products resolves to the placeholder. The exact operation that made the change cannot be confirmed from available evidence without examining the full session transcript or database audit logs.

**Acceptance checks verified directly against production (2026-08-31T07:35:50Z):**
- A1: branded URLs remaining in `ProductImage` — **0**
- A2: distinct URLs in `ProductImage` — **11**, all resolve to files in `public/` — **0 missing**
- A3: total `ProductImage` rows — **45** (unchanged)

**Residual exposure — what this remediation does NOT resolve:**

This phase achieves one thing: no page carrying a price, a brand name and a buy button presents a third party's product photography as Vertical Express own imagery. The following remain live in production:

- **10 branded category files (Phase 3):** Category composite images carrying manufacturer
  marks (UltraTech, Polycab, Havells, Philips, Dr. Fixit, Asian Paints, Fevicol, and others)
  remain in `public/categories/`.

  **Corrected 5 Sep 2026.** This entry said they "are served via `Category.imageUrl` on the
  category listing and product pages". That is false, and appears never to have been true.
  No service selects `Category.imageUrl`; `components/category-card.tsx` is the only file
  that builds a `/categories/<slug>.webp` path and **nothing imports it**; `/categories`
  renders inline SVG icons and requests no image (verified in the browser — zero `<img>`
  elements on the page).

  The real exposure is narrower and still real: the files sit in `public/`, so they are
  served as static assets to any request. `/categories/cement.webp` returns 200 today.
  Publishing a mark at a guessable URL is a smaller thing than presenting it beside a price
  and a buy button, and it is not nothing.

  **Owner input required.** Brand *names* are authorised by signed agreement. Photography is
  a separate question and these carry no documented licence. Deleting them costs nothing —
  nothing renders them — but they are not mine to delete if a licence exists.
- **ceiling-fans-exhaust:** `Category.imageUrl` points at `/categories/ceiling-fans-exhaust.webp`,
  which does not exist on disk — the URL 404s, confirmed. **No tile is broken by it**,
  because no surface reads `Category.imageUrl` or renders a category photograph at all. The
  dangling value is a data inconsistency waiting for whoever next wires that column up, not
  a defect a customer can see. `scripts/check-assets.mjs` already exempts the path in
  `KNOWN_MISSING`, which is why the guard stays green.
- **6 F3 minor-mark products retained:** `/products/ss-kitchen-sink.webp` and 5 category images (`kitchen-sinks-faucets`, `conduits-gi-boxes`, `plywood-mdf-hdhmr`, and 2 others) are retained by owner decision. Documented in `docs/ASSET_PROVENANCE.md`. Replacement scheduled for a later phase.
- **33 branded files remain in the repository:** The 10 blocked category composites plus the F3 minor-mark assets remain in `public/categories/` and `public/products/`. They are not referenced by any product-surface image, but they exist in the repository and should be removed or replaced in Phase 3.

**Authoritative backup:** `.image-backups/product-images-2026-08-30T20-36-06-876Z.json`
(SHA-256: `7a0dbc50c4bf77bd57b6aab4e73a88751620f22db9029a46f7aff775c6f32758`, 29 rows, 16 distinct pre-remediation URLs). Copy archived to iCloud Drive with matching hash.


---

## ISS-045 — `/categories/ceiling-fans-exhaust.webp` referenced but missing

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Content |
| **Status** | **PARTIAL** — guard added; the file itself is still absent |

**Description.** Found while cross-checking every distinct production image URL against
the filesystem during the ISS-044 investigation. Two production products —
`ceiling-fan-1200mm` and `exhaust-fan-250mm` — have `ProductImage.url =
/categories/ceiling-fans-exhaust.webp`, and that file does not exist in the repository.
The `CATEGORIES` list in `lib/data.ts` also carries the slug.

**User impact.** Two products render a broken image in production, and have since the
initial commit. Nothing in the pipeline noticed for months.

**Resolution.** `scripts/check-assets.mjs` now fails on any referenced-but-missing image,
so this class of defect cannot recur silently. The specific file is exempted via
`KNOWN_MISSING` so the guard is not permanently red while the underlying gap is open —
remove that entry once the file exists.

The two affected rows are included in the ISS-044 production correction, so they will
point at the neutral placeholder rather than nothing.

**Owner input required.** Either supply a category image for ceiling fans, or drop the
category. Not decided.

---

## ISS-046 — Checkout, booking and admin still authenticate against Supabase after the Firebase migration

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Auth / Commerce |
| **Status** | FIXED (1 Sep 2026) — residual dead-file deletion outstanding |

**Description.** Identity moved to Firebase, but six call sites were never moved onto
`getAuthUserId()`. They still call `supabase.auth.getUser()`. Nothing signs in to Supabase
any more, so that call now returns `null` for every visitor, including one who has just
completed a Firebase sign-in.

The system is therefore split across two identity systems that no longer agree:

| Surface | Reads | Works today |
|---|---|---|
| `app/(auth)/login/page.tsx`, sign-in form | Firebase | yes |
| `actions/cart.ts`, `address.ts`, `orders.ts`, `wishlist.ts` | Firebase | yes |
| `app/(account)/account/{orders,addresses,wallet,wishlist,bookings}` | Firebase | yes |
| `actions/checkout.ts` → `placeOrder` | **Supabase** | **no** |
| `actions/checkout.ts` → `confirmRazorpayPayment` | **Supabase** | **no** |
| `actions/booking.ts` → `submitBooking` | **Supabase** | **no** |
| `app/(account)/account/page.tsx` | **Supabase** | **no** |
| `app/(shop)/checkout/page.tsx` | **Supabase** | **no** |
| `lib/services/admin/authz.ts` | **Supabase** | **no** |

`actions/checkout.ts` reads *both*: `getCheckoutTotals` and `validateCoupon` resolve the
customer through Firebase and succeed, then `placeOrder` re-resolves the same customer
through Supabase and fails. A customer can price a basket and cannot buy it.

**Business impact.** No order can be placed. No payment can be confirmed. No service
booking can be submitted. The account and checkout landing pages redirect a signed-in
customer to `/login`, which — seeing a valid Firebase session — sends them to the home
page, so those two routes are unreachable while signed in. The admin console is
unreachable for everyone.

**Second-order risk.** The two systems do not share an id space. `placeOrder` passes
`supabase.auth.getUser().data.user.id` as `userId`; every Firebase-path call site passes
`users.id`. Repointing these at `getAuthUserId()` corrects the id space as well as the
authentication, but any row written under the old path carries a Supabase uid in a column
the rest of the system reads as `users.id`.

**Evidence.** `grep -rl "supabase.auth" actions app lib` returns the six files above.
`grep -rl getAuthUserId` returns eighteen. Verified 31 Aug 2026 against a running dev
server: `/account` and `/checkout` return 307 to `/login` with no session, and the login
page redirects an authenticated visitor to `/`.

**Misleading comment.** `lib/supabase/server.ts` states that Supabase "no longer issues or
reads sessions". That is false and would send the next reader looking in the wrong place.

**Likely files.** `actions/checkout.ts` · `actions/booking.ts` ·
`app/(account)/account/page.tsx` · `app/(shop)/checkout/page.tsx` ·
`lib/services/admin/authz.ts` · `lib/supabase/server.ts` · `app/auth/confirm/route.ts`
(dead Supabase OTP route) · `lib/services/auth-provider.ts` (dead) · `actions/auth.ts` (dead)

**Test required.** Yes — a test asserting that every server action and page resolving a
customer does so through `getAuthUserId()`, so a second identity reader cannot reappear
silently. Admin gating additionally needs its email source repointed at the Firebase
token's verified email.

**Owner input required.** No. The target architecture is already decided; these call sites
were simply not migrated.

**Resolution (1 Sep 2026).** Every live call site now resolves identity through
`lib/auth/current-user.ts` and nothing else.

- `getAuthUser()` added alongside `getAuthUserId()` for the call sites that need the
  customer's email as well as their id. The email is read from Postgres, not from the
  Firebase token, because a phone-only customer has no email on their token.
- `placeOrder`, `confirmRazorpayPayment`, `submitBooking`, `/account`, `/checkout` and
  the admin gate migrated. This also corrects the id space: they passed a Supabase uid
  where the rest of the system passes `users.id`.
- **Admin gating additionally required a security fix.** Supabase only ever returned a
  confirmed email; Firebase sets `email` on the token at sign-up, before anyone proves
  they can read that inbox. Allowlisting on it unchanged would have let anyone sign up
  as an address in `ADMIN_EMAILS` and enter the admin console. `getAdminUser()` now
  requires `email_verified === true`.
- **Two more live breaks were found while migrating.** Sign-out on the mobile account
  view called the Supabase action, which cleared nothing — the customer stayed signed
  in. The web control cleared the client credential first and the server cookie second,
  so a throw in between left the half that grants access intact. Both now call
  `signOutEverywhereOnThisDevice()`, which clears the cookie first in a `finally`.

**Guard.** `lib/__tests__/single-identity-reader.test.ts` fails if any file outside
`lib/auth/` resolves identity itself, and separately asserts that each file excused as
dead has no live importer. Verified by reintroducing the defect: the guard names the
offending file. Its first version was vacuous — it derived the repo root from
`URL.pathname`, which percent-encodes the space in the checkout path, so it scanned zero
files and passed. It now asserts a non-empty scan before believing a pass.

**Outstanding — cleanup dry run, not yet executed.** Deleting these removes Supabase Auth
entirely. Nothing outside the group imports any of it:

| Delete | What it is |
|---|---|
| `actions/auth.ts` | Supabase OTP send/verify/sign-out actions |
| `lib/services/auth-provider.ts` | Supabase OTP provider abstraction |
| `app/auth/confirm/route.ts` | Supabase email-OTP callback |
| `components/auth/login-form.tsx` | Orphaned Supabase OTP form |
| `components/mobile/auth/mobile-login-view.tsx` | Orphaned |
| `components/mobile/auth/mobile-otp-view.tsx` | Orphaned |
| `lib/supabase/server.ts`, `lib/supabase/client.ts` | Auth-only clients |
| `lib/services/__tests__/auth-provider.test.ts`, `auth-channel.test.ts` | Cover the deleted modules |
| deps `@supabase/ssr`, `@supabase/supabase-js` | No non-auth use in the tree |
| env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only `app/api/health/route.ts` still reports them |

`lib/services/__tests__/rate-limit.test.ts` asserts against `actions/auth.ts` source and
must be repointed at the Firebase path, not deleted. **Postgres is unaffected** — Prisma
reaches Supabase over `DATABASE_URL`, which does not involve the Supabase SDK.

---

## ISS-047 — OTP abuse protection was lost in the Firebase migration

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Security / Cost |
| **Status** | OPEN |

**Description.** The retired Supabase path rate-limited OTP sends:
`rateLimit("otp:" + identifier, 5, 15 * 60 * 1000, { failClosed: true })`, with a comment
citing ISS-021 and DEC-016 — "if the limiter is unreachable we refuse to send rather than
risk OTP-bombing a victim and paying for every SMS." The Firebase path has no equivalent.

**Why it cannot simply be re-added.** Under Supabase the send went through our server, so a
limiter in front of it worked. Under Firebase the browser calls `signInWithPhoneNumber`
directly against Google — **our server is not in the path and cannot throttle it.** The
protection did not get dropped by oversight so much as it stopped being implementable
where it used to live. Re-adding a limiter to a server action would protect nothing.

**The actual replacement is Firebase App Check**, which attests that the caller is our real
app before Firebase will send an SMS. It is the mechanism Firebase documents for exactly
this, and it is not configured. Invisible reCAPTCHA is a bot check on one request; it is
not a volume control.

**Business impact.** SMS pumping: an attacker drives paid SMS to numbers they control.
The SMS region policy is already restricted to IN, which caps the blast radius to Indian
numbers but does not cap volume or cost. Every message is billable.

**Secondary — FIXED (1 Sep 2026).** `app/api/auth/session/route.ts` was unthrottled. It is
ours, so a limiter does work there, and it now carries one: 30 attempts per IP per 5
minutes, keyed on IP because there is no identity to key on until the token verifies.

It fails **open**, unlike the OTP bucket in DEC-016. That bucket guards spending — each
send costs money and reaches a real handset — so refusing while the limiter is down is
correct there. This one guards CPU, and refusing while the limiter is down would lock
every customer out of signing in to protect nothing that matters.

**The primary issue stands: App Check is still unconfigured and unenforced.**

**Likely files.** Firebase console (App Check) · `lib/firebase/client.ts` ·
`app/api/auth/session/route.ts` · `lib/services/rate-limit.ts`

**Owner input required.** No, but it costs money to leave open.

---

## ISS-048 — Email/password sign-in has no password reset and no email verification

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Auth |
| **Status** | **FIXED** — the method was removed rather than completed (verified 5 Sep 2026) |

**Resolution.** Email and password no longer exist as a sign-in method. Verified by
grep across `components`, `lib`, `hooks`, `app` and `actions`:
`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `EmailAuthProvider` and
`updatePassword` appear nowhere. `hooks/use-firebase-sign-in.ts` exposes exactly two paths,
`signInWithPhoneNumber` and `signInWithPopup` with Google.

Removing it was the right answer rather than adding the two missing emails: it was a method
offered in the UI and supported nowhere, and a contractor standing on a slab is not
inventing a password. It also stopped the project depending on Firebase's per-project
scrypt signer key, which has no documented rotation path — making that key guard nothing is
the available remediation.

`lib/__tests__/sign-in-methods.test.ts` fails if any surface offers it again.

**Original description (for the record).** The sign-in form offered email/password and
called `createUserWithEmailAndPassword`, but nothing ever called `sendEmailVerification` or
`sendPasswordResetEmail`.

Two consequences, and the second is not obvious:

1. A customer who forgets their password is locked out permanently. There is no route back.
2. `email_verified` is therefore **always false** for anyone who signed up this way. Two
   other rules key off it deliberately — `lib/auth/link-policy.ts` will not let an
   unverified email claim an existing row, and `getAdminUser()` requires a verified email.
   Both are correct. But it means an email/password identity can never link and can never
   be an admin, which will read as a bug the first time someone hits it.

**Mitigating.** Phone OTP leads the form and is the market's norm; email/password is the
last option offered. The blast radius is small today and grows if email/password ever
becomes a common path.

**Likely files.** `components/auth/sign-in-form.tsx` · `lib/auth/link-policy.ts`

**Owner input required.** No.

---

## ISS-049 — A contested phone or email left a fully-authenticated customer with no account

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Auth |
| **Status** | FIXED (1 Sep 2026) |

**Description.** When an identity could not claim an existing row — an unverified email, or
a phone already bound to a different Firebase uid — `provisionUser` fell through to
`createFreshUser`, which tried to insert a second row carrying the same `phone` or `email`.
Both are `@unique`. The insert violated the constraint, the catch looked for a row with
this uid, found none, and returned `null`.

`getAuthUserId()` therefore returned `null` for somebody who had authenticated with
Firebase perfectly well and was holding a valid session cookie. They were bounced from
`/account` and `/checkout` to `/login`, which — seeing a valid session — sent them to the
home page. On every attempt. Permanently. With no error anywhere the customer could see.

**How it was found.** Not by reading the code, which had a comment asserting the opposite
("the second gets its own row, not the first one's orders"), and not by the existing 13
link-policy tests, which prove the *decision* and never touch a database. It took an
integration test driving `provisionUser` against real rows — scenarios D and E of the
production auth verification — which failed on the first run.

**Security assessment.** No takeover: the victim's row was never read, updated or returned.
The failure was closed. It was purely a denial of service, and the person denied was the
new customer, not the existing one.

**Realistic triggers.** A phone number recycled between customers · a Firebase account
deleted and recreated, giving the same person a new uid against their existing row · a
customer whose email exists on an imported row signing up with email/password, where the
address is unverified by definition.

**Resolution.** A conflicting identifier now produces an account *without* that identifier:
the customer gets a working row bound to their uid, and the contested phone or email stays
with whoever holds it. Logged at WARN with the uid and which field was withheld — never
the value itself, which belongs to somebody else — because two accounts for one number is
a support problem and support cannot merge what nobody told them about.

**Test.** `lib/__tests__/account-linking.test.ts` — seven cases against a real database,
covering scenarios A–F. D and E assert both halves: the contested row is untouched, *and*
the new account is usable.

---

## ISS-050 — `www.verticalexpress.in` is not a Firebase authorized domain

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Auth / Configuration |
| **Status** | FIXED (1 Sep 2026) |

**Description.** Firebase's authorized-domain list contains `verticalexpress.in`. The
application's canonical host is `https://www.verticalexpress.in` — `app/layout.tsx` uses it
as the `metadataBase` default, and it is the host Vercel actually serves; the apex does not
currently complete a TLS handshake.

Firebase matches `window.location.hostname` exactly. `www.verticalexpress.in` and
`verticalexpress.in` are different hostnames, so on production both Google sign-in and
phone auth's reCAPTCHA will fail with `auth/unauthorized-domain` — the popup opens and
closes immediately.

**Why it has not been seen yet.** Production has never served this build. The deployment is
returning HTTP 402 `DEPLOYMENT_DISABLED`, so nobody has reached a sign-in screen there.
Fixing the billing state without adding this domain will produce a site where sign-in is
broken for every visitor.

**Resolution (1 Sep 2026).** Added via the Identity Toolkit Admin API. The list is now
`localhost`, `vertical-express.firebaseapp.com`, `vertical-express.web.app`,
`verticalexpress.in`, `www.verticalexpress.in`.

Still open separately: the apex does not complete a TLS handshake. Decide whether it
should redirect to `www` or be served with a valid certificate.

**Secondary.** `auth/unauthorized-domain` is not mapped in the sign-in hook's `readable()`,
so the failure would surface as a raw Firebase string rather than something a customer or a
support agent could act on.

---

## ISS-051 — `/api/health` disclosed configuration and raw database errors

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Security |
| **Status** | FIXED (1 Sep 2026) |

**Description.** The endpoint is unauthenticated and internet-facing, so everything it
returned was public. It returned `paymentGateway`, `otpChannel`, `supabaseConfigured`, and
— on a database failure — the raw driver error message.

The error message was the serious one. Prisma and Postgres connection errors routinely
name the host, port, database and user, so the endpoint was **most informative to an
attacker at exactly the moment the system was failing.** `paymentGateway: "dummy"` was free
reconnaissance of its own: it announces that orders confirm without money changing hands
(ISS-002).

**Resolution.** The response is now `{ status, timestamp }` and nothing else. Liveness is
carried by the HTTP status, which is the one bit a monitor needs; the failure detail goes
to `captureException`, where operators can see it and the public cannot.

**Test.** `lib/__tests__/health-disclosure.test.ts` — a source test, not a request test,
because the leak lived in the failure branch that a request against a healthy database
never reaches. Verified by reintroducing the disclosure: the test fails.

---

## ISS-052 — SMS second-factor MFA is enabled project-wide with no client support

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Auth |
| **Status** | FIXED (1 Sep 2026) |

**Description.** The project's Identity Platform config reads
`mfa: { state: "ENABLED", enabledProviders: ["PHONE_SMS"] }`. This changed on 31 Aug 2026;
it read `DISABLED` earlier the same day.

**What `ENABLED` actually means.** Firebase has three states: `DISABLED`, `ENABLED`,
`MANDATORY`. `ENABLED` permits enrolment — it does not require it. **No existing sign-in
is affected, and nothing is broken today.** The project has 2 users and **0 have enrolled a
second factor**, so the challenge path is currently unreachable.

**Why it still matters.** Nothing in the client handles it. There is no
`getMultiFactorResolver` anywhere in the codebase, and no second-factor screen. If anyone
enrols, their next sign-in throws `auth/multi-factor-auth-required` and cannot complete —
they would be locked out of their own account with no route back.

**A constraint worth knowing.** Firebase does not allow SMS as a second factor when the
first factor is phone. This is a phone-first customer base, so SMS-MFA is inapplicable to
most of it by construction; it would only ever apply to the email/password and Google
paths.

**Interim mitigation applied.** `auth/multi-factor-auth-required` is now mapped to a plain
message rather than surfacing a raw Firebase string. That turns a confusing failure into a
clear one; it does not make the flow work.

**Resolution (1 Sep 2026).** Set to `DISABLED` on the owner's instruction. Enrolment was
the only thing `ENABLED` bought, there was no UI to enrol through, and SMS-as-second-factor
is structurally inapplicable to a phone-first product. Revisit deliberately, with an
authenticator app or passkey rather than SMS, when there is a screen to enrol through.

Email/password was disabled in the same pass (ISS-048), so the providers are now phone and
Google only — matching what the sign-in surfaces offer.

---

## ISS-053 — Production has none of the 12 environment variables Firebase auth needs

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Configuration / Deploy |
| **Status** | OPEN — owner action, values must not pass through a chat |

**Description.** `vercel env ls production` returns nine variables, all from the Supabase
era. Every variable the Firebase build reads is absent:

```
FIREBASE_PROJECT_ID                    NEXT_PUBLIC_FIREBASE_API_KEY
FIREBASE_CLIENT_EMAIL                  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
FIREBASE_PRIVATE_KEY                   NEXT_PUBLIC_FIREBASE_PROJECT_ID
                                       NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
RAZORPAY_KEY_ID                        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
RAZORPAY_KEY_SECRET                    NEXT_PUBLIC_FIREBASE_APP_ID
RAZORPAY_WEBHOOK_SECRET
```

**Why this blocks the deploy rather than merely degrading it.** Both Firebase entry points
fail loudly by design rather than falling back to a mock, which is correct
(`docs/DECISIONS.md`, production-safety rule) and means the site does not half-work:

- `lib/auth/firebase-admin.ts` throws when the three server variables are absent. Every
  path through `getAuthUserId()` therefore throws — **including `/login` itself**, which
  calls it to redirect an already-signed-in visitor. The sign-in page would 500.
- `lib/firebase/client.ts` throws without `apiKey`, `authDomain` and `projectId`, so the
  browser half fails too.

The three Razorpay secrets matter only if `PAYMENT_GATEWAY` is a `razorpay-*` value —
`assertPaymentConfig()` throws at server start in that case, and the value is stored
Sensitive so it cannot be read back to confirm.

**Also present and now meaningless.** `AUTH_OTP_CHANNEL` is a Supabase-era variable that
nothing on the Firebase path reads.

**Fix.** The owner sets these in the Vercel dashboard. **Values must not be pasted into a
chat and must not be set on the owner's behalf** — see the Secrets rule in `CLAUDE.md`.
Take `FIREBASE_PRIVATE_KEY` from a freshly rotated service-account key rather than the JSON
currently sitting in `~/Downloads`, and paste it directly into Vercel so the new key never
touches the disk.

**Do not deploy the Firebase build until this is done.** It is the last hard blocker before
the real +91 test.

---

## ISS-054 — `SpeedChip` defaults to the unverified 60-minute delivery claim

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Content / Legal |
| **Status** | FIXED (1 Sep 2026) |

**Description.** `components/ui/speed-chip.tsx` declares `etaMinutes = 60` as a default
parameter. Eight call sites render the chip without passing a value, so each of them
displays "60 min" — a figure `CLAUDE.md` lists as unconfirmed and ISS-018 flags as a
fabricated claim.

**Why it survived the earlier sweep.** Removing "60 minutes" from copy was treated as a
content problem, and this is not copy — it is a default parameter that materialises the
claim at render time in eight places at once. Grepping the pages for the string finds
nothing.

**Why it is not simply deleted.** The chip is the design's express indicator and a delivery
promise is the single most load-bearing thing on a product card in this market. An empty
chip is worse than a wrong one. The fix is the confirmed figure, or the placeholder marker
if the answer is "we do not know yet" — the same treatment now used on the COD ceiling and
the winter delay in `site-setup-view.tsx`.

**Note.** The design canvas itself shows "60 min" on these chips, so the artboards will need
the same correction once the real window is known. Matching the canvas here would mean
shipping the claim.

**Resolution (1 Sep 2026).** The default is gone. With no window set, the chip reads "Fast"
and promises no time at all; a figure appears only when one exists — from serviceability
data, or from the express-window field on `/admin/settings`, which starts empty.

The rule moved to `lib/speed.ts` on the way. It could not be tested where it was: importing
the chip drags in lucide-react and React context that the server-side runner cannot load,
so a rule governing a delivery promise had no test. Same reasoning as `link-policy.ts` and
`shipment-plan.ts` — the decision lives apart from the thing that renders it.

The hardcoded "2–3 days" lead-time label went the same way for the same reason.

**Owner input still wanted, but no longer urgent.** Nothing promises a time until the
express window is filled in on the settings screen. What is the real figure for Srinagar?

---

## ISS-055 — Every delivered order paid 5% cashback at a rate nobody set

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Money / Policy |
| **Status** | FIXED (1 Sep 2026) — default is now off, rate is the owner's to set |

**Description.** `creditCashbackForOrder` computed `Math.round(orderTotalPaise * 0.05)` and
credited it to the customer's wallet. `manage.ts` calls it whenever an order moves to
`delivered`. So every completed order created a real liability — **₹2,500 on a ₹50,000
order** — at a rate decided in a source file.

No cashback policy exists. `CLAUDE.md` names this exact class of thing: "If a rule (a
price, a delivery time, a COD limit, a GST rate) is not confirmed by the owner, do not
invent it."

**How it was found.** Not by reading the wallet service. A guard written for *copy* —
after "5% cashback" turned up in six user-facing files — also scanned `lib/`, and reported
`lib/services/wallet.ts` and `lib/services/notifications.ts`. The marketing claim was the
visible end of a live payout.

**Why the copy sweep alone would have made it worse.** Removing the promise from six
screens while the code kept crediting would have left the business paying out silently,
with nothing on the site to explain the balances customers were accruing.

**Resolution.** The rate comes from `WALLET_CASHBACK_PERCENT` and **defaults to off**.
Unset credits nothing. A value outside 0–100, or a non-number, logs and credits nothing —
deliberately not a silent fallback to a plausible figure, because a payout that pretends to
be policy is worse than no payout. `WALLET_CASHBACK_PERCENT=5` restores the old behaviour
for someone who means it.

**Tests.** `lib/services/__tests__/cashback-rate.test.ts` — unset pays zero on a ₹50,000
order, a configured 5% pays exactly ₹2,500, and three malformed values pay nothing.

**Guard.** `lib/__tests__/unconfirmed-claims.test.ts` fails on any restated cashback rate,
wallet expiry window, authorised-dealer claim, no-minimum-order promise or price guarantee.
Verified by reintroducing one.

**Owner input required.** Yes — is there a cashback programme at all, and at what rate? It
pays nothing until you answer.

---

## ISS-056 — Two different fabricated GSTINs shipped as the company's registration

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Legal / Content |
| **Status** | FIXED (1 Sep 2026) |

**Description.** `components/sections/footer.tsx` displayed `GSTIN 01AAAAA0000A1Z5` and
`app/(account)/account/orders/[orderNo]/invoice/page.tsx` displayed
`GSTIN: 01AABCV1234F1Z0`. Both were invented, and they did not even match each other.

**Why this is worse than an ordinary placeholder.** A GSTIN on an invoice is a legal
identifier that a business customer uses to claim input credit. A wrong one does not fail
politely — the customer files against it and the claim is rejected, after the fact, in
their accounting. And the invoice is the document they keep.

**Resolution.** Both removed. The real registration belongs in configuration rather than a
component, and the invoice should render it from there once it exists.

**Guard.** `lib/__tests__/unconfirmed-claims.test.ts` now fails on any GSTIN-shaped string
in source. Verified by reintroducing one.

**Owner input required.** Yes — the company's actual GSTIN, once registered, set as an
environment variable.

---

## ISS-057 — The Slots screen has no backing model

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Fulfilment |
| **Status** | OPEN — needs a model and an operational decision |

**Description.** Artboard 11 ("Site + slots per shipment") is a scheduling screen: a day
strip, two-hour windows, a per-window capacity state ("Full"), and a chosen slot per
shipment. None of it has anywhere to live.

- There is no slot or capacity model of any kind.
- `Shipment.promisedAt` exists and is the intended destination — its own comment reads
  *"Null until slots exist."* Nothing populates it.
- `ServiceablePincode` carries `etaMinutes` and a delivery fee, which describes a promise,
  not a bookable window.

**What was built instead.** The parts of the artboard that are backed: the business-details
block, mirrored word-for-word from the web checkout so both surfaces say the same thing
about tax. The slot picker itself is not stubbed — a picker offering windows nobody can
honour is a promise, and this is the screen where a customer decides when to be on site to
receive a truck.

**What it needs.** A slot/capacity model, an operational decision on which windows are
offered and how many trucks each holds, and a writer for `Shipment.promisedAt`. The first
is engineering; the second two are the owner's.

**Owner input required.** Yes — which delivery windows, and what capacity per window.

---

## ISS-058 — The storefront's default sort ranks by an always-empty column

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Catalog |
| **Status** | PARTIAL — a real ranking now exists; the default sort still needs a decision |

**Description.** `orderBy` in `lib/services/catalog.ts` maps `popular` — which is also the
`default` case, so it governs every listing that does not ask for something else — to
`[{ ratingCount: "desc" }, { createdAt: "desc" }]`.

There is no `Review` model. Nothing in the codebase writes `ratingCount`. **All 59
products in the catalogue sit at zero**, verified directly. The first sort key is therefore
inert and every listing silently falls through to `createdAt desc`: products are ordered
newest-first by accident rather than by decision, and presented as popularity.

`lib/services/search.ts` and `getRelatedProductsRaw` order by the same dead column.

**Why it went unnoticed.** It produces a plausible-looking order. Nothing errors, nothing
is empty, and the ordering only looks wrong if you know what it claims to be.

**What was done.** `mostOrderedInCategory()` ranks by summed `OrderItem.qty`, which is what
the app canvas's "Most ordered in <category>" section actually means. Orders in
`pending_payment`, `cancelled`, `refunded` and `refund_initiated` are excluded — something
abandoned at payment or refused at the gate is not evidence anybody wanted it. With no
orders yet it returns an empty array, so the caller renders nothing rather than filling the
space.

**What is still open.** The `popular`/`default` sort itself. Three options, and the choice
is a product one: rank by real order volume (accurate, but every listing changes as orders
arrive), keep newest-first but name it honestly, or curate a merchandising order. Leaving
it as "popular" backed by zeros is the one option that is actively misleading.

**Tests.** `lib/services/__tests__/most-ordered.test.ts` — empty catalogue returns nothing,
nine units outrank two, and a hundred units across abandoned and cancelled orders do not
move the ranking at all.

**Owner input required.** Yes, for the default sort.

---

## ISS-059 — Red is used for promotions and favourites, not just errors

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Design |
| **Status** | PARTIAL — the semantically wrong uses are fixed; error states remain |

**Description.** The app system board is explicit: *"No red either: urgency is carried by
amber-soft, absence by grey."* ISS-047's sweep removed raw Tailwind greens and reds, and
`check:ds` now blocks those. It does not catch `--color-danger`, which is a defined system
token — so 43 uses across 22 customer-facing files survived it.

The token is doing three unrelated jobs:

| Use | Correct? |
|---|---|
| Discount badge — "-8% OFF" | **No.** A promotion is not a danger |
| Wishlist heart fill | **No.** A saved item is affection, not alarm |
| Validation and failure messages | Arguable — the board says urgency is amber-soft |
| Destructive controls (remove, delete) | Arguable — weight is defensible here |

**Fixed.** The two that are semantically wrong, and the most visible — the discount badge
now uses amber-soft with ink text (the design's own "notice this" treatment), and a saved
heart fills ink. Both appear on every product card in the app.

**Still open.** The error and destructive states, roughly 38 uses. Each needs a judgement
the sweep should not make blind: an error a customer must not miss is a different problem
from a delete button, and replacing every one with amber-soft would flatten that
distinction. Worth doing deliberately, in one pass, with the screens open.

**Not extended to the guard yet.** `check:ds` cannot ban `text-danger` until those are
resolved, or the build breaks on 38 files.

**Owner input required.** No — a design call, but a considered one.

---

## ISS-060 — Search has no query log

| | |
|---|---|
| **Severity** | LOW |
| **Area** | Search |
| **Status** | OPEN — needs a model, and the empty state works without it |

**Description.** Two things the search artboards ask for have no data behind them:

- **"Searched most in Srinagar"** (artboard 15a) — a list of the queries customers actually
  run. Nothing records a query anywhere, so this cannot be computed. The existing static
  `POPULAR_SEARCHES` array is a guess dressed as observation, which is the same mistake as
  the `ratingCount` sort in ISS-058.
- **"Request this item"** (artboard 15c) — a button on the empty state. There is nothing to
  record a request against. A button that swallows the request silently is worse than not
  offering it, so it is not built.

**What the empty state does instead.** Says plainly that the range is fixed and this is not
in it, and routes to the catalogue. That turns a dead end into a way forward without
promising to source something nobody is tracking.

**Why this is LOW.** Neither is load-bearing. But a query log is cheap and unusually
valuable here — the searches that return nothing are a direct list of what Srinagar wants
and this shop does not carry, which is exactly the input a first-year catalogue decision
needs.

**Owner input required.** No, but worth wanting.

---

## ISS-061 — reCAPTCHA's callback was blocked by our own CSP

| | |
|---|---|
| **Severity** | **HIGH** |
| **Area** | Auth / Security |
| **Status** | FIXED (1 Sep 2026) |

**Description.** The Content-Security-Policy allowed `https://www.google.com` in
`script-src` and `frame-src` but not in `connect-src`. reCAPTCHA does not only load a
script and render a frame — it posts its result back to
`https://www.google.com/recaptcha/api2/clr`. The browser blocked that request:

```
Refused to connect ... violates the following Content Security Policy directive:
"connect-src 'self' https://*.razorpay.com ... https://identitytoolkit.googleapis.com ..."
```

Phone sign-in depends on that bot check completing, so this is an auth bug wearing a CSP
costume. Nothing throws server-side, nothing appears in the logs, and the flow simply stops.

**How it was found.** Not by testing sign-in. It surfaced in the browser console while
verifying an unrelated page, because the console had been open for a different check.

**This is the second time.** Clerk's `clerk.browser.js` was blocked by `script-src` earlier
in the same migration and the sign-in page rendered blank. Same shape: an origin present in
some directives and missing from the one that mattered.

**Why the shape recurs.** One origin usually needs several directives. reCAPTCHA needs
three — load, frame, report back. Having two of the three looks complete and is not.

**Resolution.** `RECAPTCHA` added to `connect-src`.

**Guard.** `lib/__tests__/csp-auth-origins.test.ts` asserts reCAPTCHA appears in all three
directives, that the Identity Toolkit and token-refresh origins are in `connect-src`, that
the auth domain is in `frame-src`, and that it is derived from configuration rather than
hardcoded. Verified by removing the entry.

The guard's own locator was too strict on first run — it matched `` `script-src 'self'` ``
and script-src also carries `'unsafe-inline'` — so it failed on a directive that was
correct. Fixed, and worth noting: the near-miss it exists to catch is the same near-miss it
made.

**Owner input required.** No. But this class of bug is invisible until somebody opens a
browser console, which is an argument for keeping a real sign-in in the smoke path.

---

## ISS-062 — Nothing records what a product cost

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Catalog / Finance |
| **Status** | OPEN — needs a schema field and supplier data |

**Description.** `ProductVariant` carries `pricePaise` and `compareAtPaise` — what the
customer pays. There is no cost price anywhere in the schema. The consequence shows up in
three places at once:

- **Stock cannot be valued.** Inventory × cost is the number a bank, an accountant or an
  insurer asks for. Multiplying by the selling price overstates it by the entire margin,
  and it is precisely the figure somebody would quote in good faith.
- **Margin cannot be computed.** No report can say whether a category earns anything. The
  Reports artboard asks for revenue by category, which is answerable; profit is not.
- **Purchasing cannot exist.** A purchase order is placed at a cost, and goods receipt
  reconciles against it. Both the Purchasing and Suppliers screens name this as their
  blocker.

**Why it surfaced now.** The Inventory artboard asks for a "Stock value" tile. It is the
kind of number that looks trivially computable and is not, and the honest version is a
sentence rather than a figure.

**What it needs.** A cost field on `ProductVariant` (or on a supplier–product link, if the
same item is bought from more than one supplier at different prices), and the discipline
to keep it current. The second part is the harder one.

**Owner input required.** Yes — do you want landed cost per unit, or supplier list price?
They differ by freight, and for cement arriving in Srinagar that difference is not small.

---

## ISS-063 — Cash on delivery was offered with no cash-handling operation behind it

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Fulfilment / Money |
| **Status** | FIXED (1 Sep 2026) — switched off pending the operation |

**Description.** Checkout offered cash on delivery wherever a pincode permitted it. Cash on
delivery is not a payment method, it is an operation: a driver carrying a float, a record of
what was handed over at the gate, and a daily reconciliation between what was collected and
what reached the bank. **None of those exist** — the console's own COD cash screen says so
— and no ceiling had ever been set (`CLAUDE.md`, "COD value limits — no policy exists").

So the storefront was accepting cash orders that nobody had a documented way to collect,
count or bank.

**Resolution.** Gated on a `cod.enabled` setting, defaulting to **off**, on the owner's
instruction. Two gates now have to open: the pincode must permit it, and the business must
have switched it on in the console. The default direction matters — an unconfigured system
must not offer to take money it has no process for.

Deliberately a switch rather than a deletion. The `cod` enum value stays for existing
orders, the split notice stays with a comment explaining why it is unreachable, and the ops
COD-cash screen stays. When the float, the handover record and the reconciliation exist,
this is one setting.

**Customer-facing copy updated.** The FAQ now says cash is off and why; the app's site-setup
screen says payment is online for now. Neither pretends the decision is permanent.

**Tests.** `lib/services/__tests__/cod-gate.test.ts` — unset reads as off, a permissive
pincode does not override the switch, turning it on works, and `"yes"`, `"1"`, `"TRUE"` and
`""` all read as off. Only an explicit `"true"` enables cash collection.

**Owner input required.** To turn it back on: the float process, the handover record, the
reconciliation, and a per-shipment ceiling.

---

## ISS-064 — On-time performance reported against SLA targets nobody set

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Reporting |
| **Status** | FIXED (1 Sep 2026) |

**Description.** `lib/services/admin/bi.ts` carried `const packingSlaLimit = 120` and
`const deliverySlaLimit = 240`. Every order was measured against those two numbers and
the result was rendered on the console as "Packing SLA Pass 94%" and "Delivery SLA Pass
89%" — figures a dispatcher, and eventually the owner, would read as performance against
an agreed standard. No such standard exists. `CLAUDE.md` lists delivery SLA display among
the things blocked on owner input, and the 60-minute claim as unverified.

The quieter half: both percentages fell back to `100` when the denominator was zero. A
period with no deliveries reported **100% on-time**. In a business whose own operating
manual describes January and February as near-dormant, that is the reading a normal
winter would have produced.

**Resolution.** Both targets moved to `Setting` (`ops.pack_sla_minutes`,
`ops.delivery_sla_minutes`), editable at `/admin/settings`, defaulting to unset. Unset
means the percentage is `null` — not measured — and both the Executive and Operations
tabs say so, naming Settings as where to fix it. The zero-denominator fallback is gone.
Guarded by `lib/__tests__/sla-targets.test.ts`.

---

## ISS-065 — Marketing funnel and search demand were fabricated

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Reporting |
| **Status** | FIXED (1 Sep 2026) |

**Description.** The Marketing tab of `/admin/bi` reported four figures, three of which
were invented in the source:

- `checkoutDropoffCount = Math.round(orderCount * 0.15)` — a constant. The checkout
  conversion rate derived from it was therefore always ≈87%, and no amount of real
  trading could move it.
- `topSearches` — five hardcoded terms with counts ("cement, 320").
- `noResultSearches` — four hardcoded terms ("solar tiles, 18", "excavator lease, 5").

The no-result list is the dangerous one. What customers searched for and did not find is
a catalogue gap list, and it is exactly the sort of screen someone buys stock against.
Four invented terms with plausible counts would have sent a purchasing decision at a
product nobody had asked for.

**Resolution.** No analytics event records a checkout start and nothing logs searches, so
none of the three can be computed. They now return `null` and empty, and the panels
explain what is missing rather than showing a number. `cartAbandonmentCount` is real —
it is `cartItem.count()` — but it counts items in carts people are still filling, so it
is relabelled "Items in carts" rather than abandonment. Guarded by
`lib/__tests__/sla-targets.test.ts`.

**Still open.** If checkout funnel and search demand are wanted, they need events
recorded — a search log and a checkout-started event. That is a separate piece of work.

---

## ISS-066 — Coupon limits were displayed but never enforced

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Money / Promotions |
| **Status** | FIXED (2 Sep 2026) |

**Description.** `Coupon` has carried `usageLimit`, `perUserLimit` and `firstNOrders` since
the schema was written, and `/admin/coupons` printed all three on screen. None was ever
checked. `computeTotals()` looked at `isActive`, the date window and `minOrderPaise` and
stopped there.

So a coupon marked "one per customer, 100 uses" was unlimited — per person and overall.
Anybody who learned a code could spend it as often as they liked, while the operations
console displayed limits that bound nothing. This is margin leaving the business, and the
displayed numbers made it invisible.

A second, smaller defect sat next to it: `validateCoupon()` inferred failure from "no
discount and delivery still charged". That could not distinguish a code that does not
exist from one the customer had already used — both produced the same shrug — and it
misread a valid free-delivery coupon on an already-free order as a failure.

**Resolution.** `lib/services/coupon-eligibility.ts` holds the rules in one place and is
called by both the preview and the placement path. Usage is counted from
`Order.couponCode`, which the order path already writes, so no new table was needed.
Cancelled orders give their use back; every other status has spent it. Per-customer rules
need an identity, so a signed-out preview defers them to placement rather than guessing —
but the overall usage limit is still checked, so a visitor is not offered a coupon that is
already exhausted. Refusals now carry a specific message. Covered by nine tests in
`lib/services/__tests__/coupon-limits.test.ts`.

**Resolution of the race (2 Sep 2026).** Closed. `CouponRedemption` records one row per
order with two unique constraints, and `Coupon.redeemedCount` carries a denormalised
counter. The two limits need different mechanisms because they are different shapes:

- `usageLimit` is a count across all customers, which cannot be expressed as uniqueness.
  It is taken with a conditional increment — `updateMany` with `redeemedCount: { lt: limit }`
  — the same shape as the race-free stock decrement already used for inventory. A caller
  that loses the race matches zero rows and knows it.
- `perUserLimit` is per customer, so it *is* uniqueness: `(couponId, userId, useIndex)`.
  Two concurrent orders both computing use 2 collide and the database refuses one.
- `orderId` is unique, so a retried placement cannot spend the same coupon twice.

All of it runs inside the order's transaction, so a redemption cannot exist without its
order and a failed order returns the use. A refusal fails the order rather than silently
repricing it: the customer was shown a total including the discount, and charging a
different one because a counter moved is worse than saying the code ran out.

---

## ISS-067 — An unreachable services UI carrying claims the live page no longer makes

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Services / Dead code |
| **Status** | OPEN — owner decision (3 Sep 2026) |

**Description.** Eight components form a complete services booking UI that no route
renders: `components/sections/services/{services-hero,why-choose,how-it-works,
featured-services,service-categories,services-cta}.tsx`, `components/service-card.tsx`
and `components/services/booking-modal.tsx`. `/services` imports none of them — it renders
its own copy and links to verticalconstruction.in.

The write path behind them is equally unreachable: `submitBooking` ← `BookingModal` ←
`ServiceCard` ← `ServiceCategoriesSection`, and `createBooking` throws `SERVICE_NOT_FOUND`
against an empty `services` table. Demo database: services 0, professionals 0, bookings 0.

They carry commitments nobody has confirmed, and which the live `/services` page was
corrected in f7d1280 to stop making:

- "Talk to our experts today — site visits and consultations are free."
- "Request free consultation" · "Free consultation · No obligation"
- "Our team will call you within 24 hours to schedule a free consultation."
- "Quality checked at every stage" · "Every trade, one trusted platform"

None of it reaches a customer today. All of it ships the moment somebody wires one import,
and it would then contradict the page next to it. A free site visit and a 24-hour callback
are operational commitments — someone's time, on a promise — and neither has been agreed.

`createBooking` also numbers bookings with `count() + 1`, which two concurrent bookings
resolve identically; `bookingNo` is unique, so the second crashes rather than corrupting.
Not worth fixing while the path is unreachable, and not safe to leave if it is revived.

**Why it is open rather than fixed.** Whether services return to this application at all is
the owner's call, and the register already records the other half of it: "`/admin/bookings`
still exists but is no longer linked from the sidebar. Services operations leave with
verticalconstruction.in (owner decision), so that route should be retired with the rest of
the services split rather than left orphaned."

Two coherent outcomes, and correcting the copy of dead code is neither:

1. **Retire it.** Delete the eight components, `/admin/bookings`, `/account/bookings` and
   the `Booking`/`Professional`/`Service` models with them. The services business owns its
   own site and its own data.
2. **Revive it.** Then the copy needs the same treatment `/services` got, the booking
   number needs a sequence rather than a count, and the free-visit and 24-hour commitments
   need the owner to confirm them before they are printed.

---

## ISS-068 — A product's price can be set once and never changed

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Catalog / Operations |
| **Status** | OPEN |

**Description.** `ProductVariant.pricePaise` is written in exactly one place —
`lib/services/admin/product-create.ts`, when the product is first listed. No admin path
updates it. `actions/products.ts` (`adminSaveProduct`) edits title, slug, brand, status and
delivery speed, and touches neither the price nor the MRP.

**Evidence.** `grep -rn "pricePaise:" actions lib/services` returns one write outside
reads and type declarations: the create path. The product editor's own screen says it is
deliberately limited (ISS-019), but for HSN and GST rate rather than for price.

**Why it surfaced now.** Found while auditing which money-moving paths write an audit row
(ISS-015). The answer for prices turned out to be "none of them, because none of them
exists" — a stronger statement than the one being checked for.

**Business impact.** Cement moves on a quoted rate that changes with the season and with
the Jammu road. A shop that cannot change a price has to delete the product and list it
again, which loses its slug, its order history and every saved link to it. In practice
somebody will edit the database by hand, which is the outcome an audit trail exists to
prevent.

**Why it is not simply built.** A price change is the single most consequential edit in the
catalogue and needs three things this repository does not yet have together: the edit
itself, an audit row in the same transaction (ISS-015 established the pattern), and a
decision about whether a change applies to carts already holding the item. `CartItem`
stores no price and resolves on read — deliberately — so a price change silently reprices
every open cart. That is defensible, and it is the owner's call to make knowingly rather
than discover.

**Owner input required.** Yes — should a price change apply to carts that already hold the
item, or only to carts created afterwards?

## ISS-069 — The service suite passed only on a database with leftovers

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Tests / CI |
| **Status** | RESOLVED in the working tree, 28 Sep 2026 — not yet committed |

**Description.** On a fresh CI database (migrations + `prisma db seed` only) 12 of 787
service tests failed; the same HEAD's GitHub run failed too. Three causes: ten tests in
`express-delivery`, `packing-slip` and `pick-list` borrowed "whichever user exists" and the
seed creates none; one `search-entry` test needed the brands from
`scripts/seed-real-brands.mjs`, which CI never runs; and `auth-redirect-loop` grepped the
login page for the inline open-redirect check after it moved into `lib/safe-next.ts`.

**Resolution.** Each test now creates and deletes its own user or empty brand (no unique
phone or email, so fixtures cannot collide); the redirect test asserts behaviour through
`safeNextPath` plus a one-line wiring check. Evidence:
`docs/evidence/ci-rehearsal-2026-09-28/` at the workspace root.

**Order dependence — resolved 28 Sep (autonomous loop, iteration 4).** `roster-write`,
`catalogue-import` and `shipments-write` borrowed `db.user.findFirst()` and passed only
because `places.test.ts` (which sorts earlier) leaked a user: run alone on a fresh
database they failed **29 tests** (7 + 7 + 15). Each now creates and deletes its own user;
`places.test.ts` now deletes the user it creates. Alone: 8/8, 13/13, 20/20, 11/11;
full suite on a fresh DB 796/796 with **0 users left behind**.
`product-create` still reads `findFirst()` but tolerates `null`, so it is left alone.

## ISS-070 — A build without the public Firebase config succeeded and served an error on every page

| | |
|---|---|
| **Severity** | HIGH |
| **Area** | Build / Configuration |
| **Status** | RESOLVED in the working tree, 28 Sep 2026 — not yet committed |

**Description.** `NEXT_PUBLIC_FIREBASE_*` are inlined at build time. Without them the build
passed and every route — FAQ and Terms included — rendered the error boundary, because the
header's account button starts Firebase Auth and `firebaseApp()` throws.

**Resolution.** `scripts/check-public-env.mjs` runs as `prebuild` and fails the build naming
the missing variables (names only, never values), loading `.env*` exactly as `next build`
does. CI's build step supplies obvious placeholders. **Not changed:** a runtime where the
config is missing still takes down every page; the guard only stops such a build shipping.

## ISS-071 — A dead session on /account or /checkout logged React error #310

| | |
|---|---|
| **Severity** | LOW (user lands on sign-in either way) |
| **Area** | Auth / Routing |
| **Status** | RESOLVED in the working tree, 28 Sep 2026 — not yet committed |

**Description.** Middleware redirects a visitor with no session cookie. A visitor whose
cookie is present but dead (expired, or from another environment) reached the page, whose
`redirect()` ran under `loading.tsx` after the shell had streamed with a 200. Next could
only perform it client-side as a hard navigation, and its router throws part-way through its
hooks on that path: "Rendered more hooks than during the previous render".

**Resolution.** `app/(account)/account/layout.tsx` and `app/(shop)/checkout/layout.tsx`
render above the loading boundary and call `redirectDeadSessionToSignIn()`
(`lib/auth/early-sign-in.ts`), a local signature/expiry check that can only turn a visitor
away — a real 307, preserving the exact path via a middleware-set header. Pages keep their
own authoritative `getAuthUser()` check. **Residual:** a *revoked* but unexpired session, or
a valid Firebase user with no `users` row, still reaches the page-level redirect.

## ISS-072 — Content pages were ~21px wider than a 375px phone

| | |
|---|---|
| **Severity** | LOW |
| **Area** | Storefront / Layout |
| **Status** | RESOLVED in the working tree, 28 Sep 2026 — not yet committed |

**Description.** `components/sections/content-page.tsx` rendered `ServicesBanner` inside a
`main` that already had `px-4`, stacking three gutters (`main` 32 + band 48 + card 72) around
the banner's unbreakable "verticalconstruction.in" button (244px). Every content page was
held at 396px on any phone narrower than that. The downloads price-list rows, first
suspected, were measured and do not contribute.

**Resolution.** The banner and downloads strip render after `main`, with their own single
gutter, as on `/downloads` and `/services`. On desktop this widens the content pages' band by
the removed inner gutter (at 1440px the card spans 144–1296px, exactly as on `/downloads`),
so the band now lines up with every other page instead of sitting 24px narrower each side.

## ISS-073 — Phone-web checkout breakdown did not add up to the amount charged

| | |
|---|---|
| **Severity** | MEDIUM (money display; the amount charged was always correct) |
| **Area** | Checkout / phone-web |
| **Status** | RESOLVED in the working tree, 28 Sep 2026 — not yet committed |

**Description.** `computeTotals` returns `subtotalPaise` as the **taxable value — after the
coupon, excluding GST** — with `totalPaise = subtotalPaise + taxPaise + deliveryFeePaise`.
`components/mobile/checkout/mobile-checkout-view.tsx` printed that taxable value as
"Subtotal", labelled the GST "included", and subtracted the coupon again. For the ₹320
cement order it showed Subtotal ₹250 + delivery ₹49 against a total of ₹369; with a coupon
the discount appeared to be taken twice. Desktop (`checkout-view.tsx`) already reconciled,
using the cart's inclusive subtotal.

**Resolution.** One presentational component, `components/shop/checkout/summary-lines.tsx`,
used by both checkouts, derives every figure from the server's totals: Subtotal =
`subtotalPaise + taxPaise + discountPaise` (the items at GST-inclusive prices before the
coupon — exact, because the server's taxable value per line is inclusive price minus
extracted tax), then Discount, GST (included), Delivery, so **Subtotal − Discount +
Delivery = Total**. Charged totals and tax policy are unchanged. Component tests
(`components/shop/checkout/__tests__/summary-lines.test.tsx`, 8) cover single-rate,
mixed 28%/18%, and discounted orders on both variants, with fixtures recomputed through
the real `computeGst`; restoring the old subtotal logic fails all 8. Browser-verified on
phone and desktop, with and without a coupon, free and charged delivery.

## ISS-074 — The payment-window expiry cancels orders without asking Razorpay whether they were paid

| | |
|---|---|
| **Severity** | HIGH (money taken, order cancelled) |
| **Area** | Payments / order lifecycle |
| **Status** | RESOLVED in the working tree, 28 Sep 2026 (iteration 11) — not yet committed |

**Description.** `cleanupExpiredPendingOrders` (`lib/services/orders.ts`) cancels every
`pending_payment` order older than 15 minutes and releases its stock, using only the local
status. It never asks the gateway. If a customer pays near the end of the window and the
browser callback is lost (tab closed, network drop) while the webhook is late or failing,
the order is cancelled although the money was captured. When the webhook finally arrives
it is recorded as a late capture on the refund worklist (`payment-settlement.test.ts`) —
and there is no refund executor (ISS-025, `refundPayment` has no caller). Customer charged,
order cancelled, manual refund required.

**Exposure.** Live mode refuses to start without `RAZORPAY_WEBHOOK_SECRET`, so production
relies on a webhook arriving within 15 minutes of capture. Locally and on any environment
without the secret, webhooks are rejected and the window is the only defence.

**Proposed fix (engineering, no business rule).** Add a gateway lookup to
`PaymentProvider` (Razorpay: `GET /v1/orders/{id}/payments`; dummy: none). In the expiry
job, for an online order with a gateway order id, look up its payments first: if any is
`captured`, settle it through the existing webhook settlement path (same amount and
idempotency checks) instead of cancelling; if the lookup fails, skip the order this run
rather than cancel on missing information, and alert. Tests: captured → confirmed not
cancelled; none → cancelled as today; lookup error → skipped; plus a negative control.

**Resolution (28 Sep, iteration 11).** `PaymentProvider.findCapturedPayment` (Razorpay:
`GET /v1/orders/{id}/payments`, 10 s timeout, throws on any non-OK or unreadable answer;
dummy/COD: none). `cleanupExpiredPendingOrders` asks it for each stale order's gateway
payments before cancelling: captured at the right amount → `settleCapturedPayment`
(`source: "expiry_check"`, same compare-and-set as callback/webhook); captured at another
amount → left pending + `expiry_capture_amount_mismatch` alert; lookup failed → left
pending + `expiry_gateway_lookup_failed` alert; `PaymentConfigError` (no Razorpay in this
process) → cancelled as before. Tests: `lib/services/__tests__/expiry-gateway-check.test.ts`
(6); disabling the check fails exactly the three new-behaviour tests. Existing expiry,
settlement, cancel and webhook suites unchanged and passing. **Residual:** an order whose
lookup keeps failing or whose amount keeps mismatching stays `pending_payment` (holding
stock) and alerts every run until a person resolves it.

## ISS-075 — A second, different Razorpay capture on an already-paid order was recorded nowhere

**Severity:** MEDIUM — defensive (money recorded nowhere *if* it happens). **Status:** RESOLVED 28 Sep 2026 (loop E5).

**Provider behaviour, checked against Razorpay's docs on 28 Sep 2026:** a second capture on
one Razorpay order is **not** documented behaviour. The Orders docs say no further payment is
allowed once an order is `paid`, nor while a payment on it is `authorized` — so "two checkout
windows" or "retry after a lost callback" cannot, per the docs, produce two captures. The one
route the docs leave open is **late authorization**: a bank may confirm an earlier attempt up
to 3 days later and the default setting auto-captures authorized payments; the docs do not say
whether that capture is refused when another payment already paid the order. This fix is
defensive accounting for that undocumented edge, and the tests are simulated signed
callbacks/webhooks, not reproductions of observed Razorpay behaviour.

If it happens, `settleCapturedPayment`
kept the first payment id and answered the second `already_confirmed` — right for a redelivery
of the *same* payment, but a *different* payment id left no payment row, event, alert or
worklist entry. `v1-journey.test.ts` asserted this as "a replay" (different, validly signed
payment id); that assertion is updated.

**Fix** (`lib/services/checkout.ts`): when the payment row is already captured under a different
id, lock the order row (`FOR UPDATE`), and unless that payment id is already recorded, create a
separate `captured` payment row, one same-status timeline event, and alert
`duplicate_payment_captured` (outcome `duplicate_recorded`; on a cancelled order it is
`late_recorded`, so the existing late-payment path and worklist apply). New
`listDuplicateCaptures()` feeds the admin Payments "Refund required" list
(`app/admin/payments/page.tsx`). No schema change. No refund is initiated (owner policy, ISS-025).

**Tests:** `lib/services/__tests__/duplicate-capture.test.ts` (6): webhook, browser callback,
redeliveries, a 4-way race ×4, cancelled order, same-payment redelivery creates nothing.
Negative controls: branch disabled → exactly 5 fail; lock removed → race test fails 1 in 3 runs;
with the lock 6/6 repeats pass. Clean rehearsal on this source: service **812/812**, UI 34/34,
tsc, lint, build all PASS (`docs/evidence/loop-2026-09-28/iter12-iss075-rehearsal/`, workspace root).

**Reader audit (iteration 12).** An extra captured row changes what "the newest payment" is.
Every reader of an order's payments was checked:
status-only readers (customer order detail/confirmation/history `paymentStatus`, v1
`paymentStatus`, admin orders list, `hasFunds` in cancel/advance) still read `captured` — a second
row exists only when the first is already captured. Gateway-id readers (v1 resume `razorpay`,
`retryOrderPayment`, idempotent replay) act only on `pending_payment` orders, which cannot carry a
second-capture row. **One reader misrepresented:** the admin order page's Payment panel showed
`payments[0]` (newest) — the refund-bound payment — and hid the one that paid for the order. Fixed:
`lib/payment-rows.ts` `splitOrderPayments` (oldest row = the order's payment; later captured rows =
"Second capture · refund required"), 4 unit tests. Refund worklist: dead orders list every capture
(`listCapturedPaymentsOnDeadOrders`), live orders list only captures after the first
(`listDuplicateCaptures`, excludes dead orders) — a test asserts no payment appears in both.

## ISS-076 — After a lost payment callback, "Complete payment" offered checkout again for an order Razorpay had already been paid for

**Severity:** HIGH (customer told to pay again for a paid order). **Status:** RESOLVED 28 Sep 2026 (loop E5 part 2).

If the browser's confirmation never reached the server (tab closed, network dropped) and no
webhook arrived, the order stayed `pending_payment`. Reopening it showed "Complete payment",
which reopened Razorpay on the same (already paid) Razorpay order — at best an error from
Razorpay, at worst an invitation to pay again. Only the webhook or the 15-minute expiry
(ISS-074) could recover it.

**Fix:** the ISS-074 lookup is now one shared function, `reconcileWithGateway` in
`lib/services/orders.ts` (the expiry uses it unchanged). `retryOrderPayment`
(`actions/orders.ts`, web desktop + phone) and `GET /api/v1/orders/:orderNo`
(`lib/api/v1.ts`, where the native app gets its "Complete payment" details) ask Razorpay first:
captured at the order's amount → settled (`source: "retry_check"`), the paid order is shown and no
checkout is offered; nothing captured → the retry flow as before; lookup failed or amount
mismatch → alert, no checkout details and nothing marked failed or cancelled (web: "We couldn't
confirm this payment with the bank just now. If you've already paid, please don't pay again";
app: its existing "Check again in a minute; do not pay again"); order died meanwhile → recorded
as a late capture (`LATE_PAYMENT_MESSAGE`). Ownership is checked before any gateway call; the
gateway call is outside any transaction; settlement is the existing compare-and-set. No refund.

**Tests:** `lib/services/__tests__/resume-payment-check.test.ts` (8, via the API handler with an
injected lookup). Negative control (check disabled) fails exactly the 4 new-behaviour tests.
**Browser, Razorpay TEST, local demo DB:** payment succeeded in the modal with the confirmation
request dropped → order still pending → "Complete Payment" → real Razorpay TEST lookup →
confirmed, one payment row, one transition, no checkout opened
(`docs/evidence/loop-2026-09-28/iter12-e5-lost-callback.md`).

**Not fixed (residual):** "Cancel order" on the same lost-callback order does not ask Razorpay.
It cancels and releases stock; the capture then reaches us only by webhook (required in
production by `assertPaymentConfig`) and is recorded as a late payment for refund. The web action
server-side is covered only by typecheck + the browser run (server actions need a real session).

## ISS-077 — "Cancel order" after a lost payment callback cancelled an order Razorpay had been paid for

**Severity:** HIGH (paid order cancelled, stock and coupon use released, money left on a cancelled
order). **Status:** RESOLVED 29 Sep 2026 (loop E5, money-safety close-out).

After a lost callback (ISS-076) the order still read `pending_payment`, and `cancelOrder` decided on
that local status alone: it cancelled, released stock and the coupon use, and the capture — already
at Razorpay — could only reach us later as a late payment for refund (if the webhook arrived).

**Fix** (`lib/services/orders.ts` `cancelOrder`): after the ownership, cancellable and local-funds
checks, and outside any transaction, an order with a Razorpay order is checked with
`reconcileWithGateway` (context `cancel`):
captured at the order's amount → settled through `settleCapturedPayment` (`source: "cancel_check"`),
cancel refused `PAID_NOT_CANCELLABLE`, nothing released; **authorized, capture pending** →
refused `PAYMENT_IN_PROGRESS`, nothing moves; lookup failure / timeout / amount mismatch / **no gateway
configured in this process** → refused `PAYMENT_STATUS_UNKNOWN`, nothing moves; nothing captured →
cancelled through the existing compare-and-set transaction (stock and coupon released once). Orders
with no Razorpay order (COD, or the gateway order was never created) are not looked up and cancel as
before. Customer messages (`lib/order-display.ts` `cancelErrorResult`): "couldn't check … so it
hasn't been cancelled … try again … if you've already paid, don't pay again" and "your bank has
approved a payment … still being completed". Neither claims the order is unpaid or that money is
refunded. The web order pages now refresh after a refused cancel, so an order found paid is shown
as paid rather than as the stale "awaiting payment".

**Supporting change:** the Razorpay lookup (`lib/services/payments.ts` `findCapturedPayment`) now
reports an `authorized` payment as `status: "authorized"` (a capture wins over an authorization)
instead of returning "nothing". `reconcileWithGateway` returns `authorized` and `unconfigured` as
their own outcomes; the expiry now **waits** on an authorized payment instead of cancelling it,
and "Complete payment" offers no checkout while a payment is authorized. (Follow-up below: the
expiry also no longer cancels when it cannot ask Razorpay.)

**Residual race (cannot be closed by a lookup):** a capture that happens at Razorpay *after* the
cancel's lookup — a payment completing in another tab, or a bank's late authorization of an earlier
attempt being auto-captured — still meets a cancelled order. The existing path records it: the
webhook (or a late browser callback) settles it as `late_recorded`, the payment row says `captured`
on a cancelled order, it appears on the admin "Refund required" list, and `late_payment_captured`
alerts. That depends on the webhook (or callback) actually arriving; webhook delivery is not
guaranteed, and nothing refunds automatically (refund policy is the owner's, ISS-025).
Closing this residual needs two things this repository does not yet have: **reliable
reconciliation** (a delivered webhook in every environment, or a periodic job that asks Razorpay
about recently cancelled orders), and an **approved refund process** for the money it finds. It is
not eliminated.

**Tests:** `lib/services/__tests__/cancel-lost-callback.test.ts` (9 tests, one per required case:
captured, authorized, lookup failure/timeout/mismatch/unconfigured, unpaid, no Razorpay order,
settle-after-lookup, true concurrent settle vs cancel ×6, duplicate cancels ×4, ownership before any
gateway call) and `lib/__tests__/cancel-error-mapping.test.ts` (4). Added to existing files: an
authorized case in `expiry-gateway-check.test.ts` (+1 test, provider parsing extended) and
`resume-payment-check.test.ts` (+1). Negative controls (disposable copy): cancel check removed → 5
fail; authorized distinction removed → exactly the 3 authorized tests fail (cancel, expiry, API);
unconfigured treated as unpaid → exactly the uncertainty test fails.
**Browser, Razorpay TEST, local demo DB:** lost callback → Cancel → real Razorpay TEST lookup → order
confirmed, cancel refused, stock untouched, page shows the paid order (that order had no coupon;
coupon release/keep is covered by the service tests only)
(`docs/evidence/loop-2026-09-28/iter13-e5-cancel.md`, workspace root).

**Follow-up (29 Sep 2026, iteration 14) — expiry and missing gateway configuration.** Customer
cancel refused a pending Razorpay order when this process could not ask Razorpay, but
`cleanupExpiredPendingOrders` still treated "unconfigured" like "nothing captured" and cancelled —
releasing stock and coupon use of an order that may have been paid. Now:
- `reconcileWithGateway` asks only about **Razorpay** payment rows (`gateway: "razorpay"` with a
  gateway order id); rows from the dummy gateway or COD have no Razorpay order and are not asked.
- On a configuration failure it raises `<context>_gateway_unconfigured` once per order
  ("Razorpay is not configured in this process … Set the Razorpay keys for this environment"),
  carrying the order number and the configuration error, which names settings, never their values.
- The expiry expires only on a definite "nothing captured" (or when there is no Razorpay order to
  ask about); "unconfigured" leaves the order pending with stock, coupon use and events untouched.
  The service holds this itself rather than relying on `assertPaymentConfig` at startup.
Tests (`expiry-gateway-check.test.ts`): the former "expiry cancels as it always did" test now
asserts the order stays pending (it encoded the behaviour being changed); a new regression runs the
**real** expiry with `razorpay-test` active and the keys removed — order, payment, stock, coupon
redemption and counter, and status events unchanged; the alert names the order and
`RAZORPAY_KEYS_MISSING` and contains no key material; a third test keeps expiring an order whose
only payment row is a dummy one. `payment-settlement.test.ts`'s "expiry and payment at once" race
now injects the lookup's answer ("nothing captured yet") — without an answer the expiry can no
longer cancel a Razorpay order, and the race would pass without ever exercising its cancel branch.
Negative controls: old condition restored → exactly the two unconfigured tests fail; Razorpay-only
filter removed → exactly the dummy-row test fails.
**Residual:** the expiry takes 20 stale orders per run with no ordering; if more than 20 Razorpay
orders are stuck pending (gateway unconfigured, lookups failing, amounts mismatching, or held
authorizations) the same ones are re-picked every run and later stale orders are not reached. Each
run alerts, so it is visible; it is not solved here.

## ISS-078 — Expiry batch can be starved by orders it must leave pending

**Severity:** MEDIUM (engineering; no owner policy needed). **Status:** RESOLVED 29 Sep 2026 (resolution below).

`cleanupExpiredPendingOrders` (`lib/services/orders.ts`) reads `take: 20` stale `pending_payment`
orders with **no ordering and no cursor**. Since ISS-074/ISS-077 it deliberately leaves some of them
pending: Razorpay lookup failed or timed out, captured amount mismatched, payment authorized but not
captured, or the gateway not configured in the process. Each such order is re-read on every run. If
more than 20 of them exist, every run can pick the same blocked set, and later stale orders — including
genuinely unpaid ones that should expire and release stock and coupon use — are never reached. Each run
alerts per blocked order, so it is visible, but it is not self-healing.

**Acceptance criteria**
1. With more than 20 stale orders that the expiry must leave pending (any mix of lookup failure,
   mismatch, authorized, unconfigured), a genuinely unpaid stale order created after them is expired —
   stock and coupon use released exactly once — within a bounded number of runs (state the bound).
2. Blocked orders are still never cancelled on missing information; each is still retried on later runs.
3. No order is processed twice concurrently: two overlapping runs still release stock once
   (existing `cron-cleanup.test.ts` concurrency guarantees keep passing).
4. A regression test builds the >20-blocked scenario against the real service and proves (1)–(3), with
   a negative control showing the current unordered `take: 20` fails it.
5. The chosen mechanism (e.g. oldest-first ordering plus a per-order "last checked" skip/backoff, or a
   cursor) is documented, and the alerting for blocked orders remains.

Not a policy question: the rule "never cancel on missing information" is already set; this is only about
reaching every eligible order.

**Resolution (29 Sep 2026).** A per-order claim with a lease, on one new nullable column
`orders.expiry_checked_at` (migration `20260929120000_order_expiry_checked_at`, additive, no backfill;
`docs/DATABASE_SCHEMA.md`). `cleanupExpiredPendingOrders` (`lib/services/orders.ts`):
1. selects at most `EXPIRY_BATCH_SIZE` = 20 stale `pending_payment` orders not claimed in the last
   `EXPIRY_CLAIM_LEASE_MS` = 2 min, ordered `expiry_checked_at NULLS FIRST, placed_at, id` (one indexed query);
2. for an order with a Razorpay payment to ask about, claims it just before the lookup with a conditional update
   (`expiry_checked_at = now` only if unclaimed or the lease lapsed) — this is also the round-robin step;
   an order with nothing to ask about cannot block and goes straight to the existing compare-and-set cancel;
3. asks Razorpay and cancels or leaves it exactly as before (never on authorized / unknown / mismatch /
   unconfigured; capture reconciliation unchanged; gateway call outside any transaction; stock and coupon
   released only by the CAS that moves `pending_payment → cancelled`);
4. stops claiming after `EXPIRY_RUN_BUDGET_MS` = 120 s; unclaimed orders keep their place.
A cancel transaction that throws also rotates the order, so a persistently failing one cannot hold the front.

**Progress guarantee — corrected 29 Sep 2026 (the first statement was unconditional in runs; it is not).**
What the implementation and tests establish, however many orders are blocked:
- *Per run:* ≤ 20 orders; no new claim once 120 s have passed since the run started (the selection query counts),
  so a run lasts about 120 s plus one order's examination (one Razorpay lookup, 10 s timeout — an order has one
  unsettled Razorpay payment row — plus short transactions without their own timeout).
- *Progress:* a run examines the first order it selected unless an overlapping run holds that order's claim, even
  when the budget then stops it; only a selection query that alone outlasts the budget examines nothing. An order
  a run did not reach carries no claim and keeps its place — the next run starts from it.
- *Order:* never-examined orders oldest first, then least recently claimed. A never-examined order (e.g. a newly
  stale unpaid one) is reached once the never-examined stale orders placed before it have been examined; orders
  that become stale later queue behind it. Blocked orders are re-examined after their lease, in turn.

**Runs are not a fixed bound.** With N claimable orders and none arriving, ⌈N/20⌉ runs suffice *only if every one
of those runs examines a full batch of 20*. A run examines fewer when:
- *the budget runs out* — a slow or failing gateway. By arithmetic (not tested), if every lookup hits the 10 s
  timeout about a dozen orders fit in one run; the test shows one per run when each order is slow enough, and
  that ⌈N/20⌉ such runs then do *not* reach the unpaid orders;
- *runs overlap* — they share one queue; no order is looked up twice while its claim holds, but together they may
  examine no more than one run would (orders with no Razorpay payment are not claimed; both may reach one, and the
  compare-and-set cancels it once);
- *a worker dies after claiming* — the order is not examined, becomes claimable after the 2-min lease, and its
  claim counts as an examination: it goes behind every order examined less recently (tested). Its stock and coupon
  use are untouched until it is examined; it loses its place, not data;
- *new orders become stale* — they go ahead of already-examined blocked orders (not ahead of an older
  never-examined one), postponing re-examinations.
And a run happens only when the scheduler calls the cron route (not yet configured in production — see Residual).

**Overlap and restart.** Two overlapping runs cannot claim the same order within the lease, so they do not ask
Razorpay about the same order twice while the claim holds (an examination outlasting the 2-min lease could be
repeated — a second lookup, never a second cancel), and never release stock or coupon use twice (the CAS was already
exactly-once); a run that loses a claim skips the order. A process that dies between claim and completion leaves
only a claim, which lapses after 2 min; the order is then claimed again, from the back of the queue — nothing is
cancelled unsafely and no stock or coupon use is lost.
Cron authorization (`CRON_SECRET`) is unchanged.

**Tests.** `lib/services/__tests__/expiry-queue-progress.test.ts` (5 at resolution, 7 since the correction; real service, injected clock and gateway
answers, 25 blocked orders — authorized, lookup failure, amount mismatch, unconfigured — placed before 5 unpaid
orders holding stock and a coupon use): later orders expire within ⌈N/20⌉ runs with stock and coupon released
exactly once and blocked orders untouched and looked up once; blocked orders are re-examined after the lease and
an unblocked one then expires; two concurrent workers never double-look-up or double-release; a claim left by a
crashed worker is honoured, then reclaimed; the run budget stops new claims without stranding orders. Negative
controls (isolated copy): the old unordered, claim-free selection fails 4 of 5; removing the budget check fails
the budget test. Existing expiry / cancel / coupon-release / settlement suites unchanged and passing (the
cancel-vs-expiry race test keeps its original expectations because orders with nothing to look up are not claimed).
Added with the correction (existing five unchanged): runs cut short by the budget each examine one order, the next
resumes at the first unreached order, and ⌈N/20⌉ such runs do not reach the unpaid orders while one run per
never-examined order ahead does; a crashed worker's claim sends the order behind a full batch of never-examined
orders placed after it. Negative controls (isolated copies, evidence
`docs/evidence/loop-2026-09-28/iter18-iss078-guarantee/`): claiming before the budget check fails the budget test
and the new short-run test; ordering by `placed_at` only fails the short-run and crash-position tests.

**Residual.** Nothing here is a wall-time bound: progress happens only when the cron runs, and the production
scheduler job is not configured (Firebase App Hosting — `docs/DEPLOY_FIREBASE.md`); the migration adding
`expiry_checked_at` is applied to local databases only. Both are release prerequisites (`docs/PRODUCTION_READINESS.md`,
release checklist). With many blocked orders each is re-examined only after every order examined less recently —
at best every ⌈N/20⌉ runs, more under a slow gateway. Alerts still fire per blocked order per examination.

**Audit, 30 Sep 2026 (iteration 22; owner's A–F requirements and 12 test requirements).** No defect was
found in the mechanism, so the service code is unchanged. Two tests were added to
`expiry-queue-progress.test.ts` (now 9):
- **H.** 25 blocked orders ahead of a correct capture and an unpaid order. The capture is settled
  (`confirmed`/`captured`, stock and coupon use kept). The unpaid order expires within ⌈N/20⌉ runs. Every
  order cancelled released exactly once. **Each run made at most 20 gateway lookups and never asked about
  an order twice.**
- **I.** A separate gateway stub per run, so no state is shared except the database. Run 2 resumes at
  order 21, and after the lease fresh runs look every blocked order up again, once each, and cancel none.

*Exact guarantee.* An **effective run** is a run not overlapping another, whose selection query finishes
within the 120 s budget. Each effective run examines at least its first selected order.
- A never-examined stale order with U never-examined stale orders placed before it is examined within
  **U + 1 effective runs**, and within ⌈(U+1)/20⌉ runs when every run examines a full batch.
- Already-examined blocked orders are never ahead of it (`NULLS FIRST`).
- A blocked order, once its lease lapses, with B claimable orders ahead of it, is re-examined within
  **B + 1 effective runs**. New stale arrivals count in B.

*Per-run limits.*
- At most 20 candidate rows, from one indexed query.
- At most 20 gateway lookups: one per order. Each order has exactly one lookup-able Razorpay payment
  row, because `gateway_order_id` is unique and duplicate captures are written `captured` with no
  `gateway_order_id`.
- At most 20 cancelled or settled.
- No new claim after 120 s, so a run lasts about 120 s plus one examination: a 10 s lookup timeout plus
  Prisma's default 5 s transaction timeout and 2 s wait. The few untimed single queries have an UNKNOWN
  worst case.

*Negative controls* (isolated copy, restored and checked byte-identical):
- The pre-ISS-078 unordered, claim-free `take: 20` fails 8 of 9.
- `placed_at`-only ordering fails 2.

Final gates on source manifest `42ed96bc…`: service suite 902/902, UI 68/68, tsc, lint, check:ds,
check:assets and the build guard (both cases) all pass. `next build` was BLOCKED on disk.
Evidence: `docs/evidence/loop-2026-09-28/iter22-iss078-audit/` (workspace root).

## ISS-079 — A free-delivery coupon was never recorded or used up, so its limits bound nothing

**Severity:** MEDIUM (margin: "one per customer" free delivery was unlimited). **Status:** RESOLVED 29 Sep 2026 (loop E6).

`computeTotals` applied a `free_delivery` coupon by setting the delivery fee to 0, but `placeOrder` recorded
`Order.couponCode` and called `redeemCoupon` only when `discountPaise > 0`. A free-delivery coupon has no goods
discount, so the order carried no coupon and no redemption row was written; `resolveCoupon` counts uses from
`Order.couponCode` and `redeemCoupon` guards `redeemedCount`, so neither ever moved. Its `usageLimit`,
`perUserLimit` and `firstNOrders` were therefore decorations. The seeded coupon `FIRST3` is of this type.

**Fix** (`lib/services/checkout.ts`): `CheckoutTotals.couponDeliveryWaivedPaise` — the fee a free-delivery coupon
actually took off (0 if the fee was already 0). A coupon is recorded and redeemed when it took effect: a goods
discount **or** a waived fee. The redemption's `discountPaise` is what it took off (goods discount + waived fee).
A free-delivery coupon on an order that already had free delivery takes nothing and spends nothing, matching how
a zero-effect discount coupon already behaved. No schema change.

**Test:** `lib/services/__tests__/coupon-e6.test.ts` — "a free-delivery coupon is used up like any other" fails
before the fix (order records no coupon) and passes after; negative control (old condition restored) fails exactly
that test.

**Observations raised, not changed (E6):**
- *Express fee and free-delivery coupons.* A `free_delivery` coupon zeroes the whole delivery fee **including an
  express surcharge**, although the free-delivery *threshold* deliberately does not waive express (comment in
  `computeTotals`). Whether a free-delivery coupon should cover express is a commercial rule — owner decision.
- *(Resolved by ISS-080, below.)* *A coupon that stops qualifying between preview and placement* (expired, claimed out, limit reached by another
  order) is ignored at placement: the order is placed at full price, and the higher amount is what Razorpay shows.
  The customer is not told the coupon was dropped. This is consistent with the existing "unknown code is ignored
  rather than trusted" behaviour and with the server total being authoritative, but it differs from the
  redemption-race path, which refuses the order. Whether to refuse instead (and show the new total) is a product
  decision; recorded, not changed.
- *Presentation:* checkout shows the GST-inclusive "Subtotal" (₹412) minus the coupon; the confirmation and order
  pages show "Subtotal (before GST)" (₹295.17) plus GST, with "Includes a coupon saving of ₹41.20". Both reconcile
  to the same total; the two formats may confuse. P4.
- *Accessibility:* the desktop promo-code field has only a placeholder ("e.g. FIRST3"), no label (already listed
  under E11). P4.

## ISS-080 — A coupon that stopped qualifying before placement was dropped silently and the order placed at a higher total

**Severity:** HIGH (customer charged a total they had not seen). **Status:** RESOLVED 29 Sep 2026 (loop E6 correction).

`computeTotals` ignored an ineligible coupon, and `placeOrder` went on to create the gateway order and the order at
the no-coupon total. A coupon that expired, was switched off, was claimed out by another order, hit the customer's own
per-customer limit in another tab, or stopped meeting its minimum because the basket changed — between the
coupon-applied preview and "place order" — produced an order and a Razorpay charge request for more than the customer
had been shown, with no explanation. The re-quote on the checkout screen likewise dropped it while still saying
"applied".

**Fix**
- `CheckoutTotals.couponRejection` (`lib/services/checkout.ts`): why a submitted code was not applied (the existing
  `resolveCoupon` reasons — no new rule).
- `placeOrder` refuses with `COUPON_NOT_APPLICABLE:<reason>` **before** the warehouse lookup, the gateway order, the
  transaction, the stock decrement and the redemption — nothing is written. An idempotent replay of an order already
  created is unaffected (the idempotency lookup returns it first).
- `classifyPlaceOrderError` (`lib/checkout-errors.ts`, shared by the storefront action and the native API) maps it —
  and the existing concurrent-redemption refusal `COUPON_UNAVAILABLE:*`, which used to surface as "Something went wrong
  placing your order" — to `COUPON_INVALID` with a specific, actionable message and `{ couponRejected, reason }`.
- Wording in the new client-safe `lib/coupon-refusal.ts` (`refusalMessage` moved there, re-exported unchanged).
- Both checkouts (`components/shop/checkout-view.tsx`, `components/mobile/checkout/mobile-checkout-view.tsx`): on that
  refusal they drop the coupon, re-quote from the server, show `CouponRevisedNotice`
  (`components/shop/checkout/coupon-revised-notice.tsx`: why · "Total was ₹X — now ₹Y" · "Nothing has been charged"),
  and place nothing until the customer presses the button again. Nothing can be placed at the old figure meanwhile
  (desktop: button disabled while re-quoting; phone: the bottom bar is hidden until the fresh quote). A re-quote that
  finds the applied coupon no longer qualifying does the same without a placement attempt.

**Behaviour change to an existing test:** `coupon-checkout.test.ts` "an unknown code is ignored rather than trusted"
asserted the silent full-price order; it now asserts refusal (still never trusted — no discount — but no longer
repriced). The E6 test that asserted the silent drop was replaced by the revalidation tests.

**Tests:** `coupon-e6.test.ts` — expiry, switch-off, claimed out by another customer, basket changed below the minimum,
own per-customer limit reached in another tab (each: refused before the gateway — proved by an unusable razorpay-test
gateway — with order, payment, stock, coupon use and cart unchanged; the re-quote states the reason; an explicit
no-coupon resubmission is placed at exactly the revised quote), unknown code refused, no-coupon placement unchanged,
replay of an already-created coupon order after the coupon expires, and the existing concurrent-redemption rollback.
`lib/__tests__/coupon-revalidation.test.ts` (error mapping, screen revision helpers) and
`components/shop/checkout/__tests__/coupon-revised-notice.test.tsx` (desktop + phone). Negative control (placement
check removed): exactly the 8 revalidation-dependent tests fail.

**Addendum (29 Sep 2026, ISS-078 session).** A delayed and a failed replacement quote were exercised in the browser
at desktop width. Found and fixed: while re-quoting, the desktop Total line fell back to the items subtotal (₹412 —
a figure nobody would be charged); it now reads "Updating…". A failed or rejected replacement quote was silent (the
promise was not caught; a rejected result returned quietly): both checkouts now say "We couldn't update your total …
reload the page to try again — nothing has been placed", and the desktop button stays disabled (the re-quote guard
is only cleared by a successful quote); on the phone the bottom bar stays hidden. Evidence:
`docs/evidence/loop-2026-09-28/iter17-e6-requote-delay.md` (workspace root).

**Addendum 2 (29 Sep 2026, phone-web at 390 px).** The phone path was then exercised in the browser (replacement quote
held 4 s, then failed). Safe already — the bottom bar (amount and button) was hidden throughout, no amount was on the
page, nothing was written — but not clear: the failure message sat in the banner at the top of the page, ~575 px out of
sight, the "your order was not placed" notice lived in the hidden bottom bar, and the Order Summary the customer was
looking at read "Pincode serviceability details unavailable." — untrue. Fixed with `QuotePending`
(`components/mobile/checkout/quote-pending.tsx`), which the phone Order Summary shows whenever it has no fresh quote:
while re-quoting after a refused coupon, the notice (not placed · updating your total · nothing charged); on failure,
the coupon reason and the failure message; otherwise unchanged ("Calculating totals…", the pincode text). The banner
still shows the error too. Test: `components/mobile/checkout/__tests__/quote-pending.test.tsx` (4; negative controls
fail the targeted tests); the page wiring (`mobile-checkout-view.tsx` sets `quoteFailure`) is browser-verified only.
Recovery needs fresh totals: after the failure the bar returns only when a new quote succeeds (reload, or a changed
address / delivery choice / coupon). Evidence: `docs/evidence/loop-2026-09-28/iter18-e6-phone-requote.md`.

**Residual:** the concurrent-redemption refusal happens inside the order transaction, *after* the gateway order is
created (ISS-003 keeps the gateway call outside the transaction), so a lost race can leave an unpaid, orphaned Razorpay
order; everything on our side rolls back. The native app shows the new message but does not yet drop the coupon and
re-quote by itself (native checkout is E9). The free-delivery-vs-express-surcharge question (ISS-079 observation) is
**unchanged and still an owner decision**.

## ISS-081 — Phone checkout keeps the previous total, and "place order" enabled, while an address change is re-quoted

**Severity:** MEDIUM (price consent, not the charged amount). **Status:** RESOLVED 29 Sep 2026 (found and fixed the
same day; see Resolution).

At 390 px with server actions delayed 4 s, changing the delivery address from a serviceable site (₹461) to another
address: for the whole delay the Order Summary read "Calculating totals…" while the bottom bar still showed
**TOTAL PAYABLE ₹461** with **Pay & Place Order enabled**; the new quote then arrived (₹412, unserviceable, button
disabled). The button was not pressed. `mobile-checkout-view.tsx` clears `totals` only for a refused coupon; an
address / express / coupon re-quote keeps the old totals, and the bar renders from them. The server recomputes the
total at placement, so the amount charged is the server's for the new choice — an online payment shows it in the
Razorpay modal, but a COD order would be placed at a total the customer was never shown (and an unserviceable address
is refused by the server). Desktop has a re-quote guard for coupon refusals only; its address-change path was not
exercised. Fix direction (not done): hide or disable the bar while `loadingTotals`, as the refused-coupon path already
does; add a regression. Evidence: `docs/evidence/loop-2026-09-28/iter18-e6-phone-requote.md`.

**Desktop had the same gap, and more** (inspected when fixing): `checkout-view.tsx` kept the previous totals and an
enabled "Place order" through an address / express / coupon re-quote; before the first quote the button was enabled
and the Total showed the items subtotal; applying a coupon wrote `validateCoupon`'s totals (which ignore the express
choice) and removing one fired a second, unguarded `getCheckoutTotals` without the express choice, either of which could
land after the right answer.

**Resolution (29 Sep 2026).** One quote hook for both checkouts, `components/shop/checkout/use-checkout-quote.ts`:
- every change of address, coupon or delivery choice starts a new *generation* in the same render, before any request;
  only the answer to the current generation's request is current — the previous total is never shown or submittable
  against new inputs, a late answer for an input the customer left is ignored, and going back to an earlier input asks
  again instead of reusing its old answer or old failure;
- `canSubmit` = a current quote that the server says is serviceable. Desktop: the button is disabled otherwise, the
  Total reads "Updating…" (or "—" on failure) and the failure is shown directly under it (`role="alert"`). Phone: with
  no current quote the bottom bar (amount and button) is not rendered and the Order Summary shows why (`QuotePending`).
  Both submit handlers refuse too (`QUOTE_NOT_CURRENT`), should the button be pressed anyway; the notice clears when a
  fresh quote lands;
- coupon apply only validates, then the quote hook re-quotes with the delivery choice; coupon removal no longer makes
  its own request; the E6 refusal path now works by changing the inputs (no separate `requoting`/`setTotals(null)`).
Unchanged: the server recomputes and charges its own total at placement; the idempotency key is still created once per
checkout and reused on retry; no pricing, COD or delivery rule changed.

Server actions reach the server one at a time (the second quote request was sent only after the first finished,
observed in the browser), so answers arrive in the order asked; out-of-order arrival is covered by the hook test.

**Tests.** `components/shop/checkout/__tests__/use-checkout-quote.test.tsx` (7): slow address-change quote; failed
replacement quote (network and server refusal); rapid changes with answers out of order; attempted submission in every
stale state (loading, failed, express changed, coupon changed, unserviceable); recovery after a fresh quote (new input
and remount); no address; going back to an earlier site re-asks. Negative controls (isolated copy): no newest-request
guard → the out-of-order test fails; quote not tied to the current inputs → 5 fail; submission on any answer → 5 fail.
Browser, desktop 1440 and phone 390, local demo data (a temporary fixture address at 190002, removed): all five
scenarios, 0 placements, E6 coupon refusal re-checked on both. Evidence:
`docs/evidence/loop-2026-09-28/iter19-iss081-stale-quote.md` (workspace root).

## ISS-082 — Express: a paid express order was recorded like a standard one, and a truck item could be sold the express run

**Severity:** HIGH (paid service not recorded for fulfilment; a delivery promise the order is never sent on).
**Status:** RESOLVED 30 Sep 2026 (E7) — mechanics only; express is **not** approved for production (see Policy).

Found by E7 (express delivery verification), reproduced by `lib/services/__tests__/express-checkout.test.ts` before
the fix:
1. **The choice was not persisted.** `placeOrder` charged express correctly (quote = charge = payment = Razorpay order
   amount) but wrote nothing that said so: the fee was folded into `deliveryFeePaise`, and `Shipment.speedClass`
   ("express" = bike, "scheduled" = truck) is written the same whether express was bought or not. Dispatch could not
   tell a paid express order from a standard one, nor, in a mixed basket, which line was promised the express run.
2. **Truck items could inherit the express run.** Listing lets any product be ticked express-eligible;
   `resolveExpressOption` checked only the listing and the pincode, so a truck-class product (bulk category, or
   `deliverySpeed = scheduled`) with an express pincode was offered, and charged, the express run — while the planner
   put it on the truck. Not present in the demo catalogue (all 35 eligible products are bike-class), but reachable.
3. **The standard option over-promised.** "Standard · everything together" / "keeps the order in one delivery" was
   shown for baskets that split into bike and truck shipments whatever is chosen.

**Fix.** Migration `20260929233000_express_selection` (`orders.express_fee_paise`, `shipments.express_run`; see
`docs/DATABASE_SCHEMA.md`). `resolveExpressOption` treats truck-class lines as ineligible (`speedClassOf`, the
planner's own rule). `planShipments` puts the lines on the chosen express run in their own first shipment
(`expressRun`), everything else splits exactly as before. `placeOrder` writes both from the server's quote.
`groupCartByShipment` / `ShipmentReview` show the same split at checkout ("On the express run you chose.");
`ExpressChoice` says "everything together" only when standard really is one delivery.

**Tests.** `express-checkout.test.ts` (11, placement end to end: express-only, truck-only, truck-flagged-eligible,
mixed with and without express, served-but-unlisted pincode, unserviceable pincode, express switched off with a direct
request, idempotent retry, and the free-delivery-coupon behaviour pinned as CURRENT pending the owner);
`lib/__tests__/cart-shipments-express.test.ts` (4); `components/shop/checkout/__tests__/express-choice-e7.test.tsx`
(3). Negative controls (isolated copy): each of the five fixes removed fails its tests. One existing fixture changed:
`express-delivery.test.ts`'s scratch product now uses a bike-class category — it took "the first category", which in
the seed is cement, so it had been exercising a truck item being sold express (defect 2); its assertions are unchanged.

**Verified in the browser** (desktop 1440, phone 390; demo DB; test-only ₹77 express fee and a fixture 190002 address,
both removed afterwards) and against **Razorpay TEST**: an express order placed for ₹489 (₹412 + ₹77) created a
Razorpay TEST order of exactly 48900 paise; the order recorded `express_fee_paise` 7700 and shipments [bike, express
run: switch] + [truck: cement]; the unpaid order was then cancelled (Razorpay asked, nothing captured; stock released
once). Evidence: `docs/evidence/loop-2026-09-28/iter20-e7-express.md` (workspace root).

**Policy — owner decisions still open (nothing here approves express).**
- The express **fee** (OWNER_INPUT 6.4) — none is set; express stays off ("no_price") until one is.
- The express **areas** (6.9) and whether any product is express-eligible for real — the demo's 35 eligible products
  and 210 pincode rows are seed data.
- The express **delivery time** (6.3, DEC-017) — none is promised on screen; checkout shows the pincode's standard ETA.
- **Free-delivery coupon vs express surcharge** — today a `free_delivery` coupon waives the whole delivery fee,
  express included (pinned by the CURRENT-BEHAVIOUR test). Decision needed: does a free-delivery coupon cover (a) the
  standard fee only, with express still charged, or (b) standard and express? Engineering will implement either.

**Display follow-up implemented (iteration 24, 30 Sep).** Customer order detail (desktop and phone) and admin order
now show the saved express choice and distinguish express/standard shipments. Dispatch cards, including the on-road
lane, show `expressRun`. `speedClass = express` alone never implies the selected upgrade; a zero fee remains a
selection, and null/legacy orders get no invented selection. No fee is added again and no ETA or paid-status claim
is introduced (delivery discounts can waive the surcharge). UI tests 71/71; express service tests 12/12 plus related
dispatch/ownership 7/7; tsc/lint/build pass. Authenticated browser visual checks still need O6. Evidence:
`docs/evidence/loop-2026-09-28/iter24-express-display/README.md` at workspace root.

**Residual (engineering).**
While a quote is in flight the "How fast" block is hidden (desktop and phone), so the choice cannot be changed until it
answers. The approved canvas designs a slot picker ("60 min" / truck slots, "Delivery · 60-min ₹49 · heavy ₹299");
slots do not exist (ISS-057) and those figures are unconfirmed, so the radio choice remains the interim design.

## ISS-083 — Guest cart lost at sign-in; placement could charge a total never shown after the cart changed elsewhere

**Severity:** HIGH (items silently lost at sign-in; a COD order confirmed at an unseen total).
**Status:** RESOLVED in code on 30 Sep 2026 (E8, local only). Browser verification through a real sign-in is still open; see E8 in
`docs/PRODUCTION_READINESS.md` (workspace root).

Found by E8. Each defect was reproduced by a failing test before its fix:
1. **No merge on the live sign-in.** Only the dead Supabase `verifyOtp` path called `mergeGuestCart`, and the Firebase
   session route (`app/api/auth/session/route.ts`) never did. Now `completeSignInCart` (`lib/services/cart-merge.ts`)
   runs there. On failure, sign-in still succeeds and the guest cookie is kept; `actions/cart.ts` retries once.
2. **Non-atomic merge.** A merge that failed part-way left some lines moved, and a retry added them twice. Two tabs signing in
   at once raced. Now it runs as one transaction with the guest cart row locked `FOR UPDATE`.
3. **Previous customer's cart stayed on screen** after sign-out or sign-in (client state survives `router.refresh()`).
   `lib/auth/auth-events.ts` announces the change in the tab and to other tabs (a nonce only, no identity), and
   `components/shop/cart-provider.tsx` clears the cart at once and ignores answers from before the change.
4. **Checkout quote ignored the cart's contents**, so a changed cart was not re-quoted. It is now part of the quote key.
5. **Placement priced whatever cart the server held.** A quantity changed in another window after the quote placed the
   order at a total this page never showed (for COD, confirmed). `placeOrder` now takes an optional `expectedTotalPaise`
   and refuses `TOTAL_CHANGED` before any gateway, stock or coupon write; an idempotent replay returns first. Both web
   checkouts send it and, on refusal, re-read the cart and re-quote. The native API sends nothing and keeps the old behaviour.

A regression introduced mid-fix and never released is also fixed: a cart re-read or a quantity tap set `loaded = false`,
which swapped the cart for a skeleton.

**Tests.** `lib/services/__tests__/cart-merge.test.ts`, `checkout-total-guard.test.ts` (5),
`components/shop/__tests__/cart-provider.test.tsx` (7), `components/auth/__tests__/auth-events.test.tsx`,
`components/shop/checkout/__tests__/quote-cart-change.test.tsx`. Negative controls are listed in
`docs/evidence/loop-2026-09-28/iter21-e8-cart-merge.md`.

**Owner (not blocking):** a variant in both carts has its quantities *added*. That is an implementation choice, not an
approved rule.

**Rollback.** Revert the files listed in the evidence note. No schema change.

---

## ISS-084 — Native app could place an order at a total it never showed after the cart changed elsewhere

**Status:** RESOLVED in code on 1 Oct 2026 (local only, uncommitted). Not verified on a device (E10 is blocked on the
EAS environment).

ISS-083 (item 5) closed this gap for the two web checkouts and left the native API alone. The app quotes once for the
pincode and coupon on screen. If the same account's cart changed on the website or another device after that quote,
`POST /api/v1/checkout/orders` priced the new cart and created the order. For COD the order was confirmed at a total
the app never displayed. For online payment the Razorpay sheet at least showed the real amount. A failing API test
reproduced it (200 with an order, where 409 was expected).

**Fix.**
- `lib/api/v1.ts` `placeSchema` takes an optional `expectedTotalPaise`: a non-negative safe integer; anything else is
  `VALIDATION`. It is passed to `placeOrder`, which already refuses a mismatch as `TOTAL_CHANGED` → `CONFLICT` +
  `metadata.totalChanged`. Builds that send nothing keep their behaviour.
- `mobile/src/lib/shop.ts` sends the displayed total. `mobile/src/lib/order-attempt.ts` `isTotalChanged()` recognises
  the refusal. `mobile/src/screens/checkout/index.tsx` then releases the attempt key (nothing was created), re-reads
  the cart and totals, and explains.
- ~~The same screen offered "Place order" against the previous total while totals were being re-asked.~~ **Corrected
  1 Oct (iteration 27): that claim was wrong.** `useAsync` already clears `data` when a reload starts, so the footer
  showed "—" and placement was blocked during a re-quote. The added `totals.loading` condition is harmless
  defence-in-depth, not a fix. The screen tests prove it: removing it changes nothing, while making `useAsync` keep old
  data fails the failed-quote test.

**Tests.** `lib/services/__tests__/v1-total-guard.test.ts` (4: stale total refused with no order, stock or cart change;
current total places at that total; no total = old behaviour; malformed totals refused). Negative control (the
pass-through removed): the stale-total test fails, and the current-total test fails with it because the cart was
consumed. Mobile: `order-attempt.test.ts` +1 (only CONFLICT + `totalChanged === true` counts). The screen wiring has no
component test (the mobile suite runs pure modules only); it is checked by `tsc`/lint and needs a device check under E10.

**Screen verification (iteration 27, 1 Oct).** `mobile/src/screens/checkout/__tests__/checkout-quote.screen.test.tsx`
(`npm run test:screen`, 7/7) renders the real `Checkout` screen with react-native-web in jsdom. Only the HTTP client,
auth, router, cart store, attempt storage, Razorpay sheet and icons are stubbed (`mobile/test-support/screen/`).
Proven on the screen:
- a refused changed total places nothing, releases the attempt, re-reads the cart, re-quotes, and places only on a new
  press at the new total with a new attempt key;
- a loading or failed replacement quote shows "—" and cannot place;
- an address change or a coupon apply/remove invalidates the quote, and a late answer for the previous choice is never
  shown or sent;
- a refused coupon is dropped, the order re-quoted without it, and nothing placed until a new press.
Negative controls (each restored byte-identical): no expected total sent → 6/7 fail; no total-changed handling → 2 fail;
no coupon-refusal handling → 1 fails; `useAsync` accepts stale answers → the address test fails; `useAsync` keeps old
data → the failed-quote test fails. Still open: native rendering and a device (E10).
P4 observed: while a quote reloads, the COD option hides (availability comes from the quote) and the button reads
"Pay now". The COD choice returns with the new quote; nothing can be placed meanwhile.

**Rollback.** Revert the four files. No schema change; the field is optional on the wire.

---

## ISS-085 — Every Razorpay order carried `receipt: "pending"`

**Status:** RESOLVED in code on 1 Oct 2026 (local only, uncommitted). Read-back from a real Razorpay TEST order is still
open; it happens at the next signed-in TEST placement.

Found in iteration 25 (E9, P3/ops). `placeOrder` creates the gateway order before the database transaction (ISS-003)
and passed the literal `"pending"` as its id, so support could not find an order in the Razorpay dashboard by order
number. The order number is now generated first, sent as `receipt`, and written to the order. Uniqueness and collision
behaviour are unchanged (same `orderNumber()`, same unique column). A gateway order orphaned by a failed transaction
now names an order number that never got a row; this is harmless, and easier to trace than "pending".

**Test.** `checkout-transaction.test.ts` +1: the Razorpay request's `receipt` equals the persisted `orderNo`, and its
`amount` equals the order's total. It failed before the fix (`'pending'`). Related suites 38/38.

**Rollback.** Revert `lib/services/checkout.ts` (two lines) and the comment in `lib/services/payments.ts`.

---

## ISS-086 — Cement is taxed at 28% GST; the statutory rate has been 18% since 22 Sep 2025

**Status:** OPEN — owner/accountant decision (not changed by engineering). Found 1 Oct 2026 in the business-data review.

`lib/services/tax.ts` maps `cement` to HSN 2523 at **28%** and labels the table "Owner-confirmed (Owner Q2.2 & Q2.3)".
`docs/OWNER_INPUT_REQUIRED.md` §2 (GST) is still AWAITING, with no recorded answer. The 56th GST Council meeting
(3 Sep 2025) moved Portland, slag, aluminous and similar hydraulic cements from 28% to 18%, effective 22 Sep 2025 (PIB
press release PRID 2163555; GST Council press release PDF, Sep 2025).

**Effect.** Prices are GST-inclusive, so the amount a customer pays does not change. But every cement line's recorded
split is wrong: taxable value understated, CGST/SGST/IGST overstated (on a ₹385 bag, about ₹84.22 of tax recorded
instead of about ₹58.73). That split is snapshotted on each order item and feeds the invoice and any GST reporting.
Also:
- unmapped categories fall back to 18% (`computeGst`, `config?.ratePct ?? 18`), a default nobody confirmed;
- the rest of the table predates the same rationalisation and has not been re-checked by an accountant.

**Needed (owner + CA):** confirm each category's HSN and rate under the current schedule, and what to do with orders
already placed at 28% (demo/test data only, as far as the local DBs show; production not inspected). Engineering then
changes the table (one line per rate), adds a regression test per confirmed rate, and records the source in
`OWNER_INPUT_REQUIRED.md`.

---

## ISS-087 — A production backend could run "live" on staging TEST keys

**Status:** RESOLVED in code on 1 Oct 2026 (local only, uncommitted). Found in iteration 27's hosting review.

`apphosting.yaml` is the staging configuration: `PAYMENT_GATEWAY=razorpay-test`, `ALLOW_TEST_GATEWAY=1`, and the
`rzp_test_` key id as a plain value in both `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`. App Hosting merges
`apphosting.<environment>.yaml` over it. Overriding is documented; removing a variable is not (Firebase docs, "Multiple
environments", checked 1 Oct 2026). A production environment file that set `PAYMENT_GATEWAY=razorpay-live` but missed
the key id would boot, because `razorpay-live` accepted any key id. Checkout would then run in Razorpay TEST mode:
orders confirmed, no money collected. This is the ISS-002 failure class.

**Fix (fail closed).** `activeGateway()` refuses `razorpay-live` with a key id that is not `rzp_live_…`
(`RAZORPAY_LIVE_WITH_TEST_KEY`). `assertPaymentConfig()` (boot) also refuses a `NEXT_PUBLIC_RAZORPAY_KEY_ID` that differs
from `RAZORPAY_KEY_ID`; `razorpayKeyId()` hands the browser/app the public id first. Staging is unaffected
(`razorpay-test` + `ALLOW_TEST_GATEWAY=1` + `rzp_test_`). Tests: `payments.test.ts` +3 (2 failed before the fix), 19/19.

**Rollback.** Revert the two blocks in `lib/services/payments.ts`. Production also needs the R5 environment file
(`docs/PRODUCTION_READINESS.md`).

---

## ISS-088 — Notifications reported "sent" when nothing was sent

**Status:** RESOLVED in code on 1 Oct 2026 (local only). Readiness review item 16.

`sendNotification` logged `dispatching …` and returned `{ sent: true }`, but no push, SMS or email channel exists.
Operators reading logs would believe customers were told about status changes. It now logs `not sent — no delivery
channel configured` and returns `{ sent: false }`. The only caller (`adminTransitionOrder`) ignores the result, so
behaviour is unchanged. The log line no longer carries the message title/body. Test: `notifications.test.ts` (2; both
failed before). **Owner:** choose a channel (SMS/WhatsApp/push/email) or confirm that launch has no status messages;
the site must not promise them either.
