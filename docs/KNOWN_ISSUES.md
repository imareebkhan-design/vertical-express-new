# Known Issues — Vertical Express

*Every issue below is supported by direct source inspection or live-site probing
recorded in `CURRENT_SYSTEM_AUDIT.md`. **No defect here is speculative.** If you find a
new issue, add it with the same fields and the evidence that supports it.*

**Status values:** `OPEN` · `IN PROGRESS` · `BLOCKED (OWNER)` · `BLOCKED (CA/LEGAL)` · `FIXED` · `WONTFIX`

**Severity:** `CRITICAL` (loses money or breaks the law today) · `HIGH` (blocks launch) ·
`MEDIUM` (blocks confidence) · `LOW` (quality/debt)

---

## Summary

| ID | Title | Sev | Area | Status |
|---|---|---|---|---|
| ISS-001 | GST added on top of displayed prices | CRITICAL | Money/Tax | FIXED |
| ISS-002 | Dummy payment gateway confirms orders with no money | CRITICAL | Payments | FIXED |
| ISS-003 | Razorpay HTTP call executes inside DB transaction | HIGH | Checkout | FIXED |
| ISS-004 | Inventory decrement not scoped to warehouse | HIGH | Inventory | FIXED |
| ISS-005 | Payment capture amount never verified | HIGH | Payments | FIXED |
| ISS-006 | Authentication uses email OTP, not phone | HIGH | Auth | BLOCKED (OWNER) |
| ISS-007 | Entire catalog is fictional | CRITICAL | Data | BLOCKED (OWNER) |
| ISS-008 | Fabricated public claims live in production | HIGH | Content/Legal | FIXED |
| ISS-009 | Fulfilment loop does not exist | CRITICAL | Operations | IN PROGRESS |
| ISS-010 | COD collection and reconciliation missing | HIGH | Operations/Finance | OPEN |
| ISS-011 | Coupon engine is unreachable dead code | HIGH | Pricing | FIXED |
| ISS-012 | No error monitoring, uptime or analytics | HIGH | Observability | OPEN |
| ISS-013 | Zero test coverage on commerce-critical logic | HIGH | Testing | FIXED |
| ISS-014 | Order status transitions unvalidated | MEDIUM | Orders | PARTIAL |
| ISS-015 | No audit log on money/stock/price actions | HIGH | Security/Ops | PARTIAL |
| ISS-016 | Cart accepts quantities exceeding stock | MEDIUM | Cart | FIXED |
| ISS-017 | Legal pages missing; all footer links dead | HIGH | Legal | IN PROGRESS |
| ISS-018 | Canonical URLs and sitemap emit wrong host | MEDIUM | SEO/Config | PARTIAL |
| ISS-019 | Admin product management is read-only | HIGH | Admin | OPEN |
| ISS-020 | Search has no typo tolerance | MEDIUM | Search | OPEN |
| ISS-021 | Rate limiter fails open | MEDIUM | Security | OPEN |
| ISS-022 | No security headers or CSP | MEDIUM | Security | OPEN |
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

**Owner input required.** **YES, blocking** — Q1 (contact details), Q10 Part A (per-claim
confirmation).

---

## ISS-009 — The fulfilment loop does not exist

**Progress (26 Aug 2026).** The data model now exists. Migration
`20260826095435_add_shipments` adds `Shipment` and `ShipmentItem`, and
`placeOrder` records the split inside the order transaction using the same
`Category.isBulk` rule the storefront shows on every product card — so the split
a customer is told about is the split that is written.

Still missing, and none of it is faked in the UI: driver and vehicle assignment,
slot selection, dispatch, proof of delivery, and deriving order state from
shipment state. `promisedAt`, `dispatchedAt`, `deliveredAt` and `deliveryCode`
are columns waiting for that work.

| | |
|---|---|
| **Severity** | **CRITICAL** |
| **Area** | Operations |
| **Status** | OPEN — schema and admin buildable now; roles need owner input |

**Description.** The order chain runs `cart → checkout → order → confirmed` and stops.
There is no `Shipment`, no `Driver`, no assignment, no dispatch board, no pick list, no
packing slip, no delivery OTP, and no proof of delivery. An admin can manually click an
order through `confirmed → packed → out_for_delivery → delivered`, but no operational
system sits behind those clicks.

**Evidence.** `prisma/schema.prisma` — no shipment, driver, or POD entity exists.
`app/admin/orders/page.tsx` + `components/admin/status-control.tsx` provide only a
status dropdown. Audit §10.2 traces the chain and marks where it terminates.

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
| **Status** | OPEN |

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
| **Status** | OPEN |

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
| **Status** | OPEN |

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

---

## ISS-022 — No security headers or Content Security Policy

| | |
|---|---|
| **Severity** | MEDIUM |
| **Area** | Security |
| **Status** | OPEN |

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
