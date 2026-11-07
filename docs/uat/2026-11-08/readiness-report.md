# Client UAT readiness — 8 Nov 2026 (deliverables B, E, F)

Branch `codex/client-uat-2026-11-08`, based on release head `51a2da8`. Started by
Codex and finished by Claude after Codex's usage limit. Production was **not**
touched: it stays at `51a2da8` in catalogue mode with no payment configuration.

## What changed

| Change | Where | Status |
|---|---|---|
| One-time UAT opening stock (50 per active SKU, idempotent, refuses reservations / stock at other warehouses) | `lib/services/admin/uat-inventory.ts`, `scripts/prepare-client-uat.mts` | In branch. **Applied to staging DB** 8 Nov (below). |
| Regression tests for the above | `lib/services/admin/__tests__/uat-inventory.test.ts` | 3/3 pass |
| Staging-only "client testing" banner with DRAFT returns policy | `components/uat-notice.tsx`, `app/layout.tsx`; `consistentStagingPayments` exported from `lib/deploy-env.ts` | In branch, **not deployed**: `npm run deploy:staging` only deploys the release head, so it ships after this PR is reviewed and merged. |
| Banner render tests (staging shows; production / live key / no opt-in never show) | `components/__tests__/uat-notice.test.tsx` | 3/3 pass |
| Guide, configuration map, this report | `docs/uat/2026-11-08/` | — |

**Pricing was not changed.** See "Pricing" below.

## Staging data actions (8 Nov 2026)

Staging DB `gjhxhmcsuhxcmrvtkggz`, warehouse `Srinagar Central`:

1. Dry run: 46 active SKUs, none reserved, nothing rolled forward.
2. `--apply`: all 46 SKUs set to 50 (45 were 500 from the seed, `QA-STAGING-1` was 13).
   46 `stock_movements` rows (reason `recount`, note "CLIENT UAT ONLY…") and 46
   audit markers `uat.opening_inventory_initialized`.
3. Rerun `--apply`: `initialized: []`, all 46 `alreadyInitialized` — no stock changed.
4. Verified: 46 rows at 50 at Srinagar Central, no other non-zero rows; the QA SKU's
   identity + commercial approval and `published` status survived the recount.
   Admin → Inventory shows 2,300 units, 46 SKUs at 50.

Note: three staging orders from October are still `confirmed` / `packed`. Cancelling
them now releases their stock on top of 50; that is the system working correctly,
not a top-up.

## Pricing

- 46 active staging SKUs. 22 have **no MRP**: `QA-STAGING-1` plus 21 `VE-*` seed
  SKUs (list: run `scripts/prepare-client-uat.mts` dry run, `missingMrp`).
- 24 have a stored MRP, and 23 of those sell **below** it (struck-through
  "discounts"). These values come from the seed catalogue.
  `docs/OWNER_INPUT_REQUIRED.md` 4.1 says every current price is invented and the
  owner's MRP list is AWAITING. The only recorded commercial review is the
  synthetic QA fixture. The 2 Nov catalogue-completion sheet has a `mrp_evidence`
  column, but all 996 rows are blank.
- There is therefore **no verified MRP to set prices to**. Copying the stored values
  into the price would present invented numbers as real MRP-based pricing. Nothing
  was changed. When the owner supplies MRPs with evidence, load them through Admin →
  Catalogue update (price = MRP, `mrp_evidence` filled), which re-triggers review.
- Consistency of what *is* purchasable: the QA item shows ₹199 on the product page,
  the cart, the checkout subtotal and grand total (checked in the browser at 375 px).

## B. Journey status

Legend: **PASS** = shown working with evidence on this date or by automated test
noted; **FAIL** = defect found; **BLOCKED** = cannot be tested until something
else happens; **NOT TESTED** = still needs a tester.

Payments and orders were **not** submitted on staging in this session: the agent's
safety rules forbid it submitting payments or orders on a hosted site, test mode
included. Those journeys are for the client to run (guide C9–C12). Evidence from
earlier staging test orders is given.

| # | Journey | Status | Evidence |
|---|---|---|---|
| 1 | Registration, login, logout | NOT TESTED | An existing signed-in owner session works (account, checkout, admin). Fresh sign-up and logout not run. Real SMS delivery for phone OTP is unverified (known). |
| 2 | Browsing, search, categories, filtering | PASS (mechanics) | Staging Playwright smoke 14/14 on desktop-1440 and phone-380: home, every listed category, stocked category → product, search, 404. |
| 2a | Breadth of purchasable catalogue | BLOCKED | Only 1 product is purchasable; 45 SKUs lack identity confirmation and commercial review. Needs admin approval (guide A2) or the real catalogue. |
| 3 | Product details and variants | PASS (detail) / BLOCKED (variants) | QA product page renders price, tax note, delivery check (screenshot). No purchasable product has more than one variant. |
| 4 | Cart and quantity changes | PASS (add) / NOT TESTED (qty) | Add to cart → cart shows 1 × ₹199. Note: leaving the page within ~1 s of pressing Add lost the add once; the second try succeeded. Quantity +/– not run in the browser. |
| 5 | Address creation and selection | NOT TESTED (create) / PASS (select) | Checkout lists saved addresses with pin status. Data issue: one saved staging address reads "New Delhi, Jammu & Kashmir — 110054" (existing test data). |
| 6 | Delivery selection and checkout | PASS up to payment | Checkout shows shipments, coupon field, COD unavailable, subtotal ₹199, GST included ₹30.36, delivery FREE, ETA "About 60 minutes" (seed `serviceable_pincodes`), total ₹199. |
| 7 | Razorpay success / failure | NOT TESTED on current build | Earlier builds: 11 staging payments `captured`, all `signature_verified` and with a webhook event id; 9 `created` and never captured (abandoned). No explicit failure-path evidence. Backend suite covers signature, webhook dedupe and amount checks. |
| 8 | Order creation and confirmation | NOT TESTED on current build | Earlier staging orders exist in every state. Backend suite: idempotency, price lock, total-changed refusal. |
| 9 | Order history and tracking | PASS (history) | `/account/orders` lists 10 orders per page with status and totals. Tracking page not opened. |
| 10 | Cancellation and refunds | NOT TESTED | 10 cancelled orders exist on staging, but **0 refunds** and **0 return requests** have ever been recorded there. The refund path against Razorpay TEST is unexercised on staging. |
| 11 | Inventory deduction and restoration | PASS (automated + setup) | Backend tests for decrement / release; staging opening stock applied and rerun-safe as above. Live deduction on staging awaits C9. |
| 12 | Admin product and inventory management | PASS (inventory view) / NOT TESTED (edits) | Admin → Inventory shows the new stock. Approvals and adjustments not exercised. |
| 13 | Admin order processing | PASS (view) / NOT TESTED (transitions) | Admin "Today" lists 6 orders needing action and exceptions. |
| 14 | Enquiries | NOT TESTED | 2 closed enquiries on staging. In transactional mode only catalogue-only products offer enquiry. |
| 15 | Notifications, errors, permissions | PASS (permissions) / NOT TESTED (notifications) | Anonymous: `/admin`, `/admin/orders`, `/admin/inventory`, `/account/orders`, `/checkout` → 307 to login; `/api/v1/me`, `/api/v1/orders` → 401; unsigned webhook POST → 400 "Missing signature header". Order emails/SMS not observed. |
| — | Staging testing banner | BLOCKED | Built and tested, not deployed (needs PR merge → `npm run deploy:staging`). |

### Automated evidence (local disposable DB `ve_client_uat_20261108`)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass (0 errors) |
| `npm test` (backend) | 1,477 passed, 0 failed, 0 cancelled, 0 skipped |
| `npm run test:ui` | 221 passed, 0 failed |
| Staging smoke `npx playwright test` | 14 passed |

## Payment configuration (present / missing / unverified — no values)

| Item | Staging | Production |
|---|---|---|
| `PAYMENT_GATEWAY` | present (`razorpay-test`) | missing — by design in catalogue mode |
| `ALLOW_TEST_GATEWAY` | present | absent (must stay absent) |
| `RAZORPAY_KEY_ID` (test) | present | — |
| `RAZORPAY_KEY_SECRET` | present (secret) | missing |
| `RAZORPAY_WEBHOOK_SECRET` | present (secret) | missing |
| Webhook endpoint registered in the Razorpay dashboard | verified indirectly (11 webhook events recorded) | unverified |
| Live keys | n/a | **missing** — owner to provide |

Simulated payments cannot pass as real: production refuses `razorpay-test` and
`dummy` at boot; the staging admin raises a standing "Payment gateway is
razorpay-test" exception; Razorpay test-mode payments never settle; and the banner
in this PR labels the site once deployed.

## E. Decisions and details needed for commercial launch

1. **MRP and selling price per SKU, with evidence** (OWNER_INPUT 4.1). Prices stay as
   placeholders until then.
2. **Real launch catalogue**: which SKUs, brands, pack sizes; identity and image
   approval for each.
3. **GST/HSN per product**, confirmed by the CA; the **GSTIN** (`company.gstin`).
4. **Returns policy**: approve or amend "no voluntary returns". The public `/refunds`
   text must then be rewritten; it currently describes return windows. Statutory
   remedies for defective/incorrect goods stay. Also needed: the reporting window
   and refund timeline.
5. **Delivery**: launch pincodes, ETA wording (the "About 60 minutes" claim is
   unverified), delivery fees, the free-delivery threshold (₹500 is a code guess),
   re-delivery terms.
6. **Business identity**: legal name, registered address, CIN, GSTIN, contact email
   and phone, opening hours, grievance officer if required. Owner expects to send
   these on 8 Nov 2026.
7. **Live Razorpay account**: live key id, key secret and webhook secret set by the
   owner in Secret Manager; webhook registered for the production URL; one live
   ₹1 payment and refund acceptance.
8. **Physical opening stock** per SKU for production (UAT's 50 is test-only and
   never touches production).
9. **COD**: currently off by owner decision; confirm it stays off at launch.
10. **Launch authorisation** to switch production `COMMERCE_MODE` to `transactional`.

## F. Readiness

**Ready for client testing (with limits).** Staging is up, on Razorpay TEST, isolated
from production, and has 50 test units on every active SKU. The customer path works
up to payment. Admin and permission checks behave. Limits the client should know:
only one product is purchasable until admins approve test SKUs (guide A2); the
banner is not live until this PR merges; payment, cancellation and refund
journeys still have to be run by a tester.

**Not ready for commercial production.** Missing: verified MRPs and prices, real
catalogue approvals, GST/HSN, live Razorpay keys and webhook, business identity and
legal pages, approved returns and delivery terms, physical stock, a live-payment
acceptance run.

**Blocked / awaiting approval.** Owner items E1–E10. This PR's review and merge, then
`npm run deploy:staging` to show the banner. Production stays in catalogue mode until
the owner authorises launch in writing.

## Rollback

- Code: revert the PR. The banner is presentational; the initializer only runs when
  invoked.
- Staging stock: the previous values are in each `stock_movements` row
  (`qty_after − qty_delta`) and the audit marker's `before`. To reset, use Admin →
  Inventory "Adjust" per SKU. Deleting the 46 audit markers makes the initializer
  willing to run again.

## Addendum — 8 Nov 2026 (guide review against the code)

Checked the client guide against the release head `8a65fe6`. Four corrections, now in
the guide:

1. **Cancel and refund (old C12) did not match the code.** A customer can cancel
   only an *unpaid* order (`lib/order-display.ts` `customerCancelState`; the service
   refuses a paid one with `PAID_NOT_CANCELLABLE`). Nothing refunds automatically.
   A paid order is cancelled by an admin (`advanceOrderStatus` restocks it, raises
   `paid_order_cancelled`, and lists the payment under Admin → Payments → "Refund
   required"), and the admin then refunds it there (`adminRefundPayment`, Razorpay
   TEST). The guide now tests this as C12, C12b, A4b and A6. Refunds of delivered
   orders and part-refunds stay unavailable until the owner sets a refund policy
   (ISS-025).
2. **Abandoned payments (C10).** The staging expiry job `ve-staging-cleanup-orders`
   is scheduled every 5 minutes, and the window is 15 minutes, so an unpaid order
   cancels itself and returns its stock within about 20 minutes.
3. **Native app.** Every EAS build profile (`development`, `preview`, `production`)
   sets `EXPO_PUBLIC_SITE_URL` to production, which is in catalogue mode and takes
   no orders. The guide now says so. A staging-targeted build profile is proposed
   separately in the workspace repository; making the build needs owner approval.
4. **Notifications.** Staging sets no `RESEND_API_KEY`, so no order emails are
   sent there. Phone OTP codes are real SMS. The guide now says so, and adds a
   structured issue-report checklist.

Not changed: prices (still no verified MRP), test stock (already applied), banner
(merged, still not deployed: staging serves `build-2026-11-06-004` from `f853f86`).
