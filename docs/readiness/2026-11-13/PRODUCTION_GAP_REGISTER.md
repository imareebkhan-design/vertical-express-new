# Production gap register — 13 Nov 2026

Release head audited: `2530296`. Sources: five read-only code audits (payments,
security, admin and fulfilment, phone app, storefront and owner decisions) plus live
read-only checks recorded in `CURRENT_STATE.md`. "Code-read" means a path was read, not
run. Rows marked † were re-verified by the lead; the rest rest on one audit's reading of the
code. Updated the same day after the repair pass: statuses below are current, and
`IMPLEMENTATION_PLAN.md` carries the order of work.

Severity: **P0** unsafe to open paid ordering · **P1** required capability broken or
missing · **P2** important quality or resilience · **P3** enhancement.
Type: **S** software · **C** commercial/owner decision · **X** external dependency.

No P0 software defect was found in the order, payment or authorisation paths.
Every P0 below is business data or a release-hygiene fact.

## P0

| ID | Type | Finding | Evidence | Smallest safe repair | Status |
|---|---|---|---|---|---|
| G-01 | C | Delivery fee, delivery time and serviceable pincodes are seed placeholders and would be shown to customers as real | `prisma/seed.ts:178-190`; `components/shop/pincode-check.tsx:96-102`; ₹500 free-delivery constant `lib/services/cart.ts:10` | Owner sets values in Admin → Serviceability; make the threshold a setting that defaults to off | Open — owner |
| G-02 | C | Cement is taxed at 28% in code; the tax table is labelled owner-confirmed and is not | `lib/services/tax.ts:19-21`; ISS-086 open | Accountant's written rate table, then one change to `tax.ts`, its tests and re-recorded reviews | Open — owner/CA (D5) |
| G-03 | C | No product is approved for sale: prices, MRP and physical stock are unconfirmed; production's 260 products are catalogue-only | Owner input §3–5 awaiting; working catalogue has blank prices | Owner supplies prices and counted stock | Open — owner |
| G-04 | C/X | No Razorpay live account, keys or webhook; production cannot boot in transactional mode without them | `apphosting.production.yaml` has no payment variable † | Owner completes KYC; add secrets under approval | Open — owner/Razorpay |
| G-05 | C | Legal identity, GSTIN, grievance officer, support phone, returns/refund/re-delivery terms are bracketed placeholders on live pages | `lib/content.ts:30-288` | Owner/legal text | Open — owner |
| G-06 | S | A store-profile Android build (1.0.0 build 4, 6 Nov) was made from stale unmerged source `36d8fb8` with no catalogue-mode code; its API target is not determinable from the repository | `eas build:list` †; `eas.json` sets no `EXPO_PUBLIC_API_URL` for `production` | Do not promote it. Pin the API URL in the `production` profile and rebuild from reviewed `main` | **Partly fixed, in review** — workspace PR #25 pins the production API address with a test (270/270). The 6 Nov build must still not be promoted; a new store build from reviewed `main` is not made † |

## P1

| ID | Type | Finding | Evidence | Smallest safe repair | Status |
|---|---|---|---|---|---|
| G-10 | S | A backend declared production could boot on the Razorpay test gateway | `lib/services/payments.ts:121-124` † | Refuse when `VE_DEPLOY_ENV=production` | **Fixed, merged 14 Nov, not deployed** — PR #59 (`321ee46`); full backend suite 1546/1546 |
| G-11 | S | No reconciliation against Razorpay: a capture after cancellation is invisible unless a webhook arrives | `lib/services/orders.ts:389-458, 556-575`; `app/admin/payments/page.tsx` | Admin action/daily job re-running the gateway lookup over recently cancelled orders | **Fixed, merged 14 Nov, not deployed** — PR #60 (`d349021`): the 5-minute job asks Razorpay about cancelled orders placed in the last 6 h † |
| G-12 | S | Any price or product edit de-lists the product, and no console action can record the commercial review that re-lists it — only QA/UAT scripts write it | trigger in `20261009100000_catalogue_commercial_invalidation`; `commercial-readiness.ts:35-52`; no writer in `actions/` | "Record commercial review" admin action with approver and reason, audited. Who may approve is an owner decision | **Fixed, merged 14 Nov, not deployed** — PR #62 (`c8c5a0d`) †. Any operator may record it until D4 is decided |
| G-13 | S | Failed delivery is a dead end for a paid order: no return-to-warehouse control, order stuck `out_for_delivery`, refund refused | `shipments-write.ts:231` has no caller; `lib/order-flow.ts:29`; `refunds.ts:64-79` | Wire `receiveShipmentBack` to a button; allow cancel when no live shipment remains | **Fixed, merged 14 Nov, not deployed** — PR #61 (`18b284e`) †. A part-delivered order still cannot be ended or part-refunded (owner policy, OD-9) |
| G-14 | S/X | No customer or operator notification is delivered anywhere: email keys unset, SMS/push is a stub, no new-order alert, no Sentry DSN | `order-emails.ts:29-30`; `notifications.ts:23-26`; hosting files † | Set `RESEND_API_KEY`/`EMAIL_FROM` and `SENTRY_DSN`; add an operator new-order email to the existing outbox | Open — needs secrets |
| G-15 | S | Dispatch-board "Cancel" has no confirmation and is offered in every state | `components/admin/dispatch-controls.tsx:179` | Confirm plus required reason | **Fixed, merged 14 Nov, not deployed** — PR #61: Cancel asks first and is not offered while goods are on a vehicle † |
| G-16 | S | Listed product shows Add to cart and the cart then refuses (ISS-105) | `catalog-policy.ts:76` vs `cart.ts:249` | Listing uses the full readiness check, or re-record reviews in the same change | Open — **re-graded P2** †: only a change to the tax table in code triggers it (database triggers cover every console edit), and the server refuses the sale. It becomes live work the day the cement rate changes (G-02); PR #62 makes re-recording possible from the console |
| G-17 | S | Rate-limit keys trust client-supplied `x-real-ip` / first `x-forwarded-for` | `lib/services/rate-limit.ts:152-163`; `app/api/auth/session/route.ts:43-46` | One helper using the platform-appended entry. Needs a live check on staging first | **Confirmed live, fixed, in review** — staging, 13 Nov: a forged `x-real-ip` and a forged first `x-forwarded-for` entry each chose the bucket; with neither, the true address did †. PR #63 (`2611027`), backend 1553/1553. The hop count must be checked on staging before production (`docs/DEPLOY_FIREBASE.md`, "Client address") |
| G-18 | S/C | One admin tier, shared across staging and production; no MFA; 14-day admin sessions | `lib/services/admin/authz.ts:21-52`; shared secret † | Separate production allowlist secret; enforce MFA; shorter admin session | Open — owner (D4) |
| G-19 | C | No GST tax invoice is generated | `/admin/invoices` placeholder; `lib/content.ts:140` | Owner/CA decision on format and GSTIN | Open — owner |
| G-20 | S | Phone app: no account-deletion path (store requirement); background location declared for all users | `mobile/src/screens/account/index.tsx`; `app.json:88-90` | Deletion row plus endpoint; store declarations | Open |
| G-21 | S | Phone app in catalogue mode still shows cart, quick-add and reorder that the server refuses | `tab-bar.tsx:56-62`; `home/index.tsx:248-257, 423-447`; `orders/index.tsx:64` | Gate on the `orderingOpen` flag the cart already carries | **Partly fixed, in review** — workspace PR #24: quick-add and Reorder follow `orderingOpen` (268 unit, 35 screen tests) †. Not changed: the Cart and Orders tabs (the canvas has five destinations), the first-list card wording, `/checkout` reached directly |
| G-22 | C | Unverified delivery claim on the app sign-in screen (issue #19) and in the site's Open Graph title | `sign-in/index.tsx:360-368`; `app/layout.tsx:52,62` | Owner-approved neutral copy | Open — owner |
| G-23 | X | iOS store build impossible: no active Apple membership, no team/app id, APNs unverified | workspace PR #21 notes; `eas.json:59` | Owner enrols | Blocked — external |
| G-24 | S | Neither `main` nor the release branch is protected on a public repository | GitHub API † | Require PR and the `verify` check | Open — needs approval (settings change) |

## P2

| ID | Finding | Evidence | Status |
|---|---|---|---|
| G-30 | Admin cancel of a pending online order skipped the gateway check | `manage.ts:40-99` † | **Fixed, merged 14 Nov, not deployed** — PR #60 |
| G-31 | Unmatched captured webhook and unknown-payment refund returned 200 silently; signature header logged | `webhooks/razorpay/route.ts:24,36,86` † | **Fixed, merged 14 Nov, not deployed** — PR #60 |
| G-32 | Razorpay order creation had no timeout | `payments.ts:243-255` † | **Fixed, merged 14 Nov, not deployed** — PR #60 |
| G-33 | Web confirm action reported a late payment as a failed verification | `actions/checkout.ts:157` † (the screen already recovered via a status check) | **Fixed, merged 14 Nov, not deployed** — PR #60 |
| G-34 | Webhook amount mismatch answers 400, so Razorpay retries for hours | `route.ts:97-116` | Open — changes tested behaviour; decide |
| G-35 | Order placement uses Prisma's default 5 s transaction timeout | `checkout.ts:451` | Open |
| G-36 | 18 tables have row-level security off. Live check: no table is reachable by the API roles on production, so this is defence in depth only | catalogue query † | Open — forward migration, apply under approval |
| G-37 | Weak or missing limits on booking, coupon validation, order placement, product search action | `actions/booking.ts:30`, `actions/checkout.ts:22-66`, `actions/catalog.ts:5-7` | Open |
| G-38 | Customer server actions do not validate argument types at runtime | `actions/orders.ts:18-107` and others | Open |
| G-39 | Script CSP allows `unsafe-inline`; broad `*.googleapis.com`; HSTS lacks `includeSubDomains` | `next.config.ts:79-200` | Open |
| G-40 | Catalogue import writes no audit row; audit IP is never recorded | `catalogue-import.ts`; `audit.ts:55` | Open |
| G-41 | Dependency advisories: Capacitor 8.5.0 (critical, unused shell), `@grpc/grpc-js`, `fast-uri` (high) | `npm audit` on the lockfile | Open |
| G-42 | Blocked Razorpay script throws after the order exists (desktop checkout) | `checkout-view.tsx:227`; `order-actions.tsx:99` | **Fixed, in review** — PR #64 (`2f25228`): one shared loader, both desktop screens catch the failure; 3 new tests, UI 241/241 †. Not tried with a real content blocker |
| G-43 | Confirmation page says "Order placed" for any status, including unpaid | `confirmation-switcher.tsx:50-51` | Open |
| G-44 | Error page claims the team was notified; nothing is sent | `app/error.tsx:13-23` | Open |
| G-45 | Reorder inserts variants without the visibility gate (not purchasable; cart read filters) | `orders.ts:349-357` | Open |
| G-46 | Policy pages inherit a canonical pointing at the home page | `app/layout.tsx:48-50` | Open |
| G-47 | Phone app: stale link to a hidden category shows a useless Retry (issue #23); home shortcuts hard-coded without PR #22 | `subcategory/index.tsx:56`; `home/index.tsx:323-345` | Open — #22 is safe to merge |
| G-48 | Phone app: no deep-link domains, no relaunch prompt for a pending payment, no CI in the workspace repository | audit | Open |
| G-49 | Returns never restock or refund; no refund on a delivered order; exceptions queue is narrow; no global audit page | `actions/returns.ts:9-11`; `exceptions.ts:35-125` | Open — partly owner policy |
| G-50 | Production's serving build is documented only in unmerged PR #41 | `CURRENT_STATE.md` † | Open — merge #41 |
| G-51 | Staging has no uptime check; alerts reach Cloud Logging only | Cloud Monitoring † | Open |
| G-52 | Admin product page can show the previous price and review on the first reload after a save (database correct throughout) | Seen live on staging, 14 Nov, `qa-staging-paint-tin` † | **Root cause found, fix in review** — PR #66. Not caching: the reload started before the save was sent, because the console's saves queued behind storefront cart and wishlist reads fired on every page (staging request log). Not yet verified on staging † |
| G-53 | Launch Control UI test "apply sends every reviewed row…" times out at its 5 s budget under the full UI run (1 of 264) and passes 3/3 alone | Local full run, 14 Nov † | Open — intermittent test, not a product defect |

## Verified sound (no action)

Server-side pricing and totals; atomic stock decrement; idempotent placement; signature
and amount checks on callback and webhook; single settlement transaction; expiry job
with gateway check; cancel and refund exactly-once; COD refused server-side; catalogue
mode refuses every order path; every customer query owner-scoped; all 49 admin actions
check the operator themselves; upload validation; cron and webhook fail closed; QA and
UAT scripts refuse the production database. Code-read with a named test for each; none
was re-run this session beyond the suites listed against the fixes.

## Still open after the repair pass

Software, not started: G-20 (phone app account deletion), G-24 (repository setting, needs approval), and the P2 rows not
marked fixed. Everything else open is an owner decision (`OWNER_DECISIONS.md`) or an
external dependency. Live checks outstanding: the rate-limit hop count after the next staging rollout,
Firebase console settings (test phone numbers, MFA, email provider), Razorpay
dashboard, contents of the admin allowlist.

**Production remains NO-GO for paid orders.**
