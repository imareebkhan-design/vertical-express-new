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

## Live scenarios on staging, 14 Nov 2026 (01:17–01:23 IST)

Build `build-2026-11-13-001`, commit `1f09491`. Run in a browser under the owner's
operator sign-in, with the owner's approval. Synthetic QA data and Razorpay TEST
mode only. Each result below was observed live and then checked in the staging
database; none is an automated test.

| # | Scenario | Result | What was done and seen |
|---|---|---|---|
| 7 | Catalogue visibility | **PASS** (cart-add not exercised) | Launch Control: switched Tiling off. Review dialog showed "27 → 26 (1 hidden)", "20 → 19". After Apply: `/category/tiling` 404, `/api/v1/categories/tiling` 404, absent from the category list, `/product/tile-adhesive-20kg` 404, API product 404, absent from the product list (26), search and suggestions. Undo showed "26 → 27", and after it every one of those returned. Audit: `catalogue.category_hidden` + `catalogue.launch_batch`, then `catalogue.category_shown` + `catalogue.launch_batch` carrying `undoOf`. The first batch reads "Undone" in Recent changes. Not exercised: adding the hidden product to a cart by variant id |
| 8 | Admin workflow | **PASS** for price and review; stock and order edits not run | `qa-staging-paint-tin`: selling price ₹349 → ₹339, saved. The review was cleared and the product left the shop (API 404, page 404, 26 listed). "Record review" on the product page (PR #62) with a note and the confirmation: product back on sale at ₹339 with the operator as reviewer — no script. Price restored to ₹349 and the review recorded again; 27 listed. Audit: two `variant.price_changed` with before and after, two `catalogue.commercial_review_recorded` |
| 6 | Cancellation and refund | **PASS** for refund; a fresh paid cancel not run | Order `VE-2026-MUZ7TZF154CC` — paid in TEST mode on 8 Oct, cancelled, never refunded — was on Payments → Refund required. Refund ₹199 with a reason and the two-step confirm. Razorpay accepted it (`rfnd_TzmV…`); the row showed pending, and the page offered "Check with Razorpay" instead of a second Refund. 40 seconds later the row was `processed` and the payment `refunded`, written by Razorpay's **webhook** (`payment.refund_processed`, actor system, source webhook) — nobody pressed Check. One refund row exists |
| 4 | Duplicate payment event | **Not run** | — |
| 1, 2, 3, 5, 11 | Purchase, failure, abandonment, concurrency, interruption | **Not run** | See below |
| 12 | Operational completion | **Not run** | See below |
| 10 | Mobile | **Not run** | No device |

What the refund result also shows: a signed Razorpay TEST webhook reaches this
staging build and is accepted. That had not been observed on any build before today.

### Why the rest stopped

The browser tools available to this session changed when it was resumed; pages can
no longer be driven from here. The purchase scenarios additionally need a payment
completed inside Razorpay's own window, which this session does not do — the person
testing completes that step.

### State of staging afterwards

| | Before | After |
|---|---|---|
| Orders / pending | 21 / 0 | 21 / 0 |
| Captured payments | 11 | 10 (one now `refunded`) |
| Refund rows | 0 | 1, processed, ₹199 |
| Stock movements / units on hand | 58 / — | 58 / 2,502 (no stock moved) |
| Tiling category | shown | shown |
| `QA-STAGING-2` price | ₹349 | ₹349 |
| `qa-staging-paint-tin` reviewer | `qa-fixture` | the operator's account (a real difference left behind) |
| Products listed | 27 | 27 |

Also left: three rate-limit counter rows from the 13 Nov header probes, and eleven
audit rows from the scenarios above.

### Defect found while testing

**G-52 (P2).** Immediately after saving a price on the admin product page, one reload
showed the previous price and the previous review; the next reload was correct. The
database held the new values throughout. An operator who reloads to confirm a change
can be shown the old state. Not yet investigated.

## 14 Nov 2026, later — G-52 resolved, test tooling restored

### G-52: root cause and fix

Not a caching defect. The admin product page is `force-dynamic` and was never cached.
The staging request log shows the reload (GET 19:49:57.84 UTC) **started before** the
price save was sent (POST 19:49:58.18), so it rendered the database as it then was.
The save was late because the shared cart provider reads the cart and wishlist on
every page, the console included — on arrival, on focus and when the tab returns —
and a page's server actions are sent one at a time, so the save queued behind them.

Fix: PR #66 — the cart provider is paused on `/admin` routes. Regression test: the
paused provider makes no read on arrival, focus, tab return or sign-in (it made 3
cart and 2 wishlist reads before the change). **Not yet verified on staging** (needs
a deploy).

### Browser and harness capability now

| Capability | State |
|---|---|
| Built-in browser pane | Control tools not available to this session |
| Playwright 1.64.1 | Installed; its cached Chromium is the wrong version |
| Playwright driving the installed Chrome (`channel: "chrome"`) | **Works**, no download |
| Repository smoke suite against staging | **14/14 passed** on `build-2026-11-13-001` (anonymous, phone 380 and desktop 1440) |
| A dedicated Chrome window with its own empty profile, driven over a local debugging port | **Works** — the staging login page was read and can be driven. Signed-in scenarios need the owner to sign in there once |
| Test sign-in harness on staging | None exists; none was created |

### Run locally against the test database (automated, gateway injected — not staging)

Stock concurrency, idempotent placement, duplicate capture, settlement, expiry and
ledger-completeness tests on the release code: **60/60**. This is the isolated
harness evidence for scenarios 4 and 5; it is not a live gateway result.

### Still not run on staging

New purchase with a TEST payment (1), payment failure (2), abandoned checkout (3),
duplicate event against the live webhook (4), cart-add of a hidden product, cross-customer
access, stock adjustment and order edits (8), failed delivery and return to
warehouse (12), #63's hop check, #64 with a real content blocker, any device test.

## Live purchase, fulfilment and failure scenarios — 14 Nov 2026, 11:34–11:48 IST

Staging `build-2026-11-13-001` (`1f09491`), Razorpay TEST mode. Driven by script in
two dedicated Chrome windows: a customer signed in by phone and an operator signed in
by the owner. **The owner completed the payment in Razorpay's window by hand**; nothing
else was done by hand. Every result was then read back from the staging database.
Staging-live evidence — not automated tests, not mocked.

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | Successful purchase | **PASS** | Order `VE-2026-MWG044KT135E`, ₹199 (taxable ₹168.64 + CGST ₹15.18 + SGST ₹15.18), free delivery. Placed 06:04:57 UTC as `pending_payment`; stock of `QA-STAGING-1` 52 → 51. Paid in Razorpay's test window; `payment.captured` webhook confirmed the order at 06:07:00. Payment `pay_Tzwzh…`, gateway order `order_Tzwx…`, signature verified, one payment row, event id stored. Stock stayed 51 — deducted once. Customer saw "Order placed · Paid online", then Confirmed on the order page |
| 3 | Abandoned checkout | **PASS** | Order `VE-2026-MWG095HAE742`: placed, Razorpay window left without paying. Order page showed "Payment pending" with Complete Payment and Cancel; no paid order existed; stock 51 → 50. Customer cancelled (asks first): order `cancelled`, "Not paid", stock back to 51. The 15-minute expiry job was not waited for |
| 12 | Operational completion | **PASS** | Same paid order, from the console only: found in Orders (Paid / Unfulfilled, payment reference, tax split, timeline); dispatch board → Mark packed → assign driver → Dispatch (issues the customer's code; customer page showed Out for delivery and the code) → a wrong code was refused ("That code does not match this delivery") → the right code delivered it. Order `delivered` 06:13:38. No script, no database edit |
| 12b | Failed delivery | **PASS** (PR #61, live) | October paid order `VE-2026-MV2QYSVM0394`: assigned, dispatched, then "Delivery failed: received back" — asks what happened and confirms the goods are back. Shipment returned to `packed`, order corrected `out_for_delivery → packed`, `shipment.received_back` audited with the reason. Then cancelled on its order page (confirmation names the refund worklist): stock restored 51 → 52, `inventory.released` audited |
| 6 | Refund after cancellation | **PASS** (second time) | The same order appeared under Payments → Refund required. ₹199 refunded with a reason and the two-step confirm (the script would have stopped on any other amount). Razorpay accepted `rfnd_TzxA…`; 40 s later its webhook marked it processed and the payment `refunded` |
| 9 | Unauthorised access | **PASS** | A phone-only customer account opening `/admin` is told it is not an operator and gets no console. A different signed-in account opening the first customer's order, order summary, confirmation and tracking pages saw none of the order's contents, and its own order list did not include it |
| 7 | Cart holding an item whose category is then hidden | **PASS**, with a usability gap | Customer put `tile-adhesive-20kg` in the cart; operator hid Tiling (the review dialog warned "1 item already in shoppers' carts can no longer be bought"). The customer's cart then read "Your cart is empty" and checkout had no Place order — the item could not be bought. After Undo the item was back in the cart. **Gap:** the cart gives no explanation while the item is hidden (register G-54) |
| 8 | Admin audit trail | **PASS** | Every step above wrote audit rows: `shipment.status_changed`, `shipment.assigned`, `order.status_changed`, `shipment.received_back`, `order.status_corrected`, `inventory.released`, `payment.refund_requested / _pending / _processed` |
| 2 | Payment failure | **Not run** | Needs a second hand-completed payment using Razorpay's Failure option |
| 4 | Duplicate payment event (live) | **Not run** | Needs a replay from the Razorpay dashboard, or approval to sign a test event |
| 5 | Concurrent stock (live) | **Not run on staging** | Local harness only, 60/60 |
| 8 | Stock adjustment, order edits | **Not run** | — |
| 11 | Network interruption | **Partly** | Leaving the payment window (scenario 3) is the closest case run; no connection was cut mid-request |
| 10 | Mobile | **Not run** | No device |

### Reconciliation, staging database

| | Start of 14 Nov | Now |
|---|---|---|
| Orders | 21 | 23 (one delivered, one cancelled unpaid) |
| Pending payment | 0 | 0 |
| Payments captured / refunded | 11 / 0 | 10 / 2 (11 + 1 new − 2 refunded) |
| Refund rows | 0 | 2, both processed by webhook, ₹199 each |
| Stock movements | 58 | 62 |
| Units on hand, all SKUs | 2,502 | 2,502 (one sold, one restocked) |
| `QA-STAGING-1`, Srinagar Central | 52 | 52 |
| Lowest stock row | 0 | 0 — nothing negative |
| Tiling category / products listed | shown / 27 | shown / 27 |

### Seen while testing

- **Nothing was sent to the customer or the operator** at any step. Each change wrote
  `order.notification_pending`; the order-confirmation email sits queued. This is G-14,
  now observed live.
- **"About 60 minutes" was shown as the delivery time** at checkout, on the confirmation
  and on the order page. It is seed data, not an owner-confirmed promise (G-01).
- **Console actions took 5–7 s to show their result** on the dispatch board. PR #66
  removes part of that wait; it is not deployed.
- The dispatch-board card kept the label "Awaiting" while its shipment was out for
  delivery. Cosmetic; not investigated.

### Left on staging

Two new orders under the QA customer (one delivered, one cancelled), one October order
now cancelled and refunded, two processed test refunds, the audit rows above. Both
carts used are empty. No price, product, category or setting differs from before.
