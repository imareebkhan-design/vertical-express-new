# Staging verification — 13 Nov 2026

**No end-to-end purchase was performed today.** This file says what was observed
live, what only automated tests cover, and exactly what each blocked scenario is
waiting for. Automated, simulated and live results are kept apart: a passing unit
test is not evidence that Razorpay, a phone OTP, an email or a real device works.

Staging: `ve-staging`, build `build-2026-11-08-001`, commit `ea02aac` — 16 commits
behind the release head and without PRs #58–#64. Isolation (`CURRENT_STATE.md` §4):
separate database, payment credentials (test only), storage and runtime identity;
**shared** Firebase sign-in pool and operator allowlist.

## Why the transaction tests are blocked

1. **No test sign-in is available to this session.** Ordering needs a signed-in customer (phone OTP or Google) and the operator tests need an allowlisted account. Neither a Firebase test phone number nor an operator session was available, and creating one is a change to the shared sign-in pool that needs approval.
2. **This review found no record of a captured test payment on the current staging build.** The 8 Nov acceptance run stopped at Razorpay's contact validation (`docs/uat/2026-11-08/resumed-verification.md`); earlier documents report test-mode verification but give no order to check. Tests 1, 4 and 6 all start from a captured payment.
3. **Staging does not run the code under review.** Results on `ea02aac` would not cover #58–#64.

To unblock: merge and deploy to staging (approval), then provide a staging test customer and an operator sign-in, or run the browser steps with the owner signed in.

## Scenarios

| # | Scenario | Result | Evidence today | Automated cover (local database, gateway injected) |
|---|---|---|---|---|
| 1 | Successful purchase | **BLOCKED** (1, 2) | none | placement, settlement and stock tests in the 1,546–1,550 suite |
| 2 | Payment failure | **BLOCKED** (1) | none | `payments.test.ts`, `webhook.test.ts` |
| 3 | Abandoned checkout | **BLOCKED** (1) for the live run. 8 Nov: unpaid order cancelled, stock 50 → 49 → 50 (REPORTED) | none today | expiry tests incl. `expiry-queue-progress.test.ts` |
| 4 | Duplicate payment event | **BLOCKED** (2) | none | webhook dedupe on event id; single settlement transaction |
| 5 | Concurrent stock | **NOT RUN on staging** | none | guarded decrement tests with forced interleavings |
| 6 | Cancellation and refund | **BLOCKED** (2). The 8 Nov run submitted no refund, and this review found no record of one in test mode | none | refund tests with the gateway injected; new: `admin-cancel-gateway-check`, `late-capture-sweep`, failed-delivery cancel |
| 7 | Catalogue visibility | **PARTIAL** — production is in catalogue mode and answers 401 to an unauthenticated cart write; category/brand switches (#58) are not deployed anywhere | probe below | Launch Control suites (CI on `fe6a442`) |
| 8 | Admin workflow | **BLOCKED** (1) | none | admin service tests; new: `commercial-review`, `shipment-received-back` |
| 9 | Unauthorized access | **PASS for unauthenticated access, live.** Cross-customer access **not tested live** (needs two test customers) | probe below | owner-scoping tests |
| 10 | Mobile integration | **BLOCKED** — no device was used. The 6 Nov store build must not be used (G-06); the 7 Nov internal build is from `main` | none | workspace test suite, not re-run today |
| 11 | Network interruption | **NOT RUN** | none | timeout and idempotency tests |
| 12 | Operational completion | **BLOCKED** (1, 3) — the failed-delivery path exists only in PR #61 | none | dispatch and roll-up tests |

## Live probes, 13 Nov 2026 09:27 UTC

No credentials, read-only apart from two rejected webhook posts. No data was created.

| Request | Staging | Production |
|---|---|---|
| `GET /api/health` | 200 | 200 |
| `GET /admin`, `/admin/orders` | 307 to `/login?next=…` | — |
| `GET /checkout` | — | 307 to `/login` |
| `GET /api/v1/orders` | 401 | 401 |
| `GET /api/v1/cart`, `/api/v1/driver/shipments` | 401 | — |
| `GET /api/cron/cleanup-orders` without the secret | 401 | 401 |
| `POST /api/webhooks/razorpay`, no signature / wrong signature | 400 / 400 | — |
| `POST /api/v1/cart/items`, no session | — | 401 |

A webhook post with a valid signature was not attempted: the signing secret is not
this session's to read.

## Cleanup

Nothing to clean up: no order, customer, product or payment was created on staging
or production. Local test databases `vertical_express_test` and
`vertical_express_test2` (created today for parallel runs) hold test rows only.

## Remaining risk

This review could not find, or produce, a payment completed end to end against Razorpay
on the current staging build. Until tests 1, 2, 4 and 6 pass on staging with a real test-mode
capture and refund, payment correctness rests on code reading and injected-gateway
tests.


## After the 14 Nov staging deploy

Staging: `build-2026-11-13-001`, commit `1f09491` (#57–#62 included; #63 and #64 not).
Source archive compared file by file with `git archive 1f09491`: no differences.

| Check | Before (`ea02aac`) | After (`1f09491`) | Kind |
|---|---|---|---|
| `/`, `/categories`, `/search`, `/cart`, `/api/health`, `/api/v1/categories`, `/api/v1/products`, `/api/serviceability/190001` | 200 | 200 | live, anonymous |
| `/checkout`, `/admin`, `/admin/launch-control` signed out | 307 | 307 | live, anonymous |
| `/api/v1/orders` without a token | 401 | 401 | live |
| `/api/cron/cleanup-orders` without the secret | — | 401 | live |
| Webhook post with no signature | — | 400 | live |
| Unknown category | — | 404 | live |
| Products returned by `/api/v1/products` | 27 | 27 | live |
| CLIENT TESTING banner | present | present | live |
| All 20 category links on the home page | — | 200 each | live, in a browser |
| Product page `ppc-cement-50kg`: title, price, Add to cart, no broken images, no console errors | — | as expected | live, in a browser |
| Launch Control with the new switchboard ("Change what customers see", "Recent changes") | absent | present | live, operator session, **viewed only** |

Not run: the repository's Playwright smoke suite. This machine has no browser binary
for the installed Playwright version, and the workflow cannot be started on GitHub
because it is not on the default branch. The browser checks above cover the same
anonymous journey by hand; they are not the suite.

Nothing was changed on staging by these checks. No switch was applied, no order
placed, no payment attempted. Scenarios 1–6, 8, 10–12 remain **not run**.
