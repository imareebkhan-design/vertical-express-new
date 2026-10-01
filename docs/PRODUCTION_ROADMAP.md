# Vertical Express — Production Roadmap

*Updated 2026-09-21.* The canonical high-level answer to: **where is Vertical Express today, what remains, and what is the path to production?**

**OWNER DECISION — Option A approved:** continue custom commerce, Firebase Auth, Expo, Razorpay, Firebase App Hosting and EAS. See [DEC-019](DECISIONS.md). The Shopify audit is complete. No Shopify implementation/migration is authorized. Refund, invoice, COD, operational, production-data and device gaps are not waived.

**Staging status update (supersedes the historical tables below):** first deployment completed; recovered session verified hosted Firebase authentication and staging database binding. Health/catalogue and unauthenticated 401 checks were rechecked on 21 September. Staging has 18/18 migrations and the 20-category/10-brand/45-product/45-variant demo seed. `database-url` is set/granted. EAS development/preview API URLs were verified in the prior session. Source exclusion checked with Firebase CLI 15.30.2: 615 files, zero `.env*`. See [verification evidence](../../STAGING_VERIFICATION_2026-09-21.md). The next gate is exposed staging credential recovery; do not duplicate the rollout, migrations or seed.

How this document relates to the others:

| Document | Purpose |
|---|---|
| **`PRODUCTION_ROADMAP.md`** (this) | Project status, gates, dependencies, path to production |
| `DEPLOY_FIREBASE.md` | The operational Firebase App Hosting runbook (commands, config, secrets) |
| `KNOWN_ISSUES.md` | The issue register. **Issue IDs are defined there**; this document only references them. |
| `../../task.md`, `../../implementation_plan.md` | Working checkpoints for the current implementation sequence (workspace root) |
| `../CLAUDE.md` | Engineering operating manual. Where a rule here and a rule there differ, the manual wins. |

**Evidence labels** used throughout:

- **VERIFIED** — a command, test or live request was actually run and passed.
- **IMPLEMENTED — NOT RUNTIME/DEVICE VERIFIED** — code exists and is unit/API tested, but it has not been run on a deployed backend or a real phone.
- **BLOCKED** — cannot proceed without an external action.
- **OWNER DECISION REQUIRED** — a business or policy choice that engineering must not invent (`CLAUDE.md`: "No speculative business rules").

No secrets, connection strings or tokens appear in this document, by design.

---

## Current Status

### Backend & API

| Item | State |
|---|---|
| `/api/v1` customer journey (categories, products, product detail, serviceability, cart, addresses, checkout totals, place order, confirm payment, order list/detail, order lookup by idempotency key) | **VERIFIED** by tests — backend `tsc` exit 0, lint exit 0, **623/623** tests (2026-09-20). Contract: `API_V1.md`. |
| Firebase Bearer authentication (401 for missing/forged/revoked token) | **VERIFIED** in tests, and **VERIFIED locally in production mode** with a real Firebase ID token against the real Firebase project (temporary user, deleted afterwards). *Not* verified on a deployed backend. |
| Order-creation idempotency and recovery | **VERIFIED** by tests (replay returns the order's true current status; lookup by key is read-only and scoped to the caller). |
| Production build (`npm run build`) and `next start` in production mode | **VERIFIED locally** from a clean copy against a local database (health, categories, products, website pages, cron 401, webhook 400 on bad signature). This is **not** the deployed runtime. |
| Full migration chain (18 migrations, including `payments.gateway_order_id` unique) on an *empty* database | **VERIFIED** (local rehearsal). **Not** yet applied to the real staging database. |
| Deployed API on Firebase App Hosting | **BLOCKED** — see Current Next Action. |

### Mobile

| Item | State |
|---|---|
| `tsc` 0 errors, lint clean, **61/61** tests | **VERIFIED** (2026-09-20) |
| Phone OTP and Google sign-in (Firebase native) | **IMPLEMENTED — NOT RUNTIME/DEVICE VERIFIED** (helpers unit-tested only). Note `KNOWN_ISSUES` ISS-006 still describes email OTP and predates this; phone/Google auth exists in code. |
| Catalogue, product, cart, address + checkout, order detail/confirmation, order history screens | **IMPLEMENTED — NOT RUNTIME/DEVICE VERIFIED** (never run in a simulator or on a phone) |
| Persisted checkout attempt + recovery, double-submit guard, "checking payment status" handling | **IMPLEMENTED — NOT DEVICE VERIFIED** (pure logic unit-tested; AsyncStorage persistence never run on a device) |
| `react-native-razorpay` native module | **IMPLEMENTED — NOT RUNTIME/DEVICE VERIFIED**: autolinking resolves for iOS and Android (verified); **no native build has ever been made**; compatibility of its iOS pod with `useFrameworks: static` is unknown until a build. |
| Native builds (iOS/Android) | **BLOCKED** on a reachable API URL (and, for iOS, interactive Apple sign-in) |

### Payments

| Item | State |
|---|---|
| Server-side Razorpay order creation, HMAC verification, order/customer binding, webhook, amount check | **VERIFIED** by tests |
| Late capture (payment after the order expired): recorded, order not revived, alert raised, appears on a worklist; duplicates/races idempotent; `payment.failed` never downgrades a captured payment | **VERIFIED** by tests (mutation-checked) |
| `payments.gateway_order_id` unique | **VERIFIED** on local test DB and on an empty rehearsal DB; **not applied anywhere shared** |
| Razorpay TEST keys | **VERIFIED** — Razorpay's test API accepted them (a ₹1 test order was created; no money moved). They live only in a gitignored local env file. The pasted secret should be rotated. |
| Razorpay TEST webhook secret + dashboard webhook | **BLOCKED** (needs a deployed URL and the owner's dashboard) |
| Refunds | **OWNER DECISION REQUIRED** — nothing initiates a refund; see ISS-025. Late payments are *recorded*, not refunded. |
| Razorpay LIVE | **Not configured; must not be** until Phase 5 approval. |

### Infrastructure

| Item | State |
|---|---|
| Hosting target | **DECIDED:** Firebase App Hosting (Vercel abandoned — its project returns `402 DEPLOYMENT_DISABLED`). |
| `apphosting.yaml`, `firebase.json`, `.firebaserc`, secrets script, staging-DB guard script, runbook | **IMPLEMENTED — NOT DEPLOYED.** The staging-DB guard is **VERIFIED** (refuses the production project, mismatched projects and a missing file). |
| Guarded test-gateway opt-in (`ALLOW_TEST_GATEWAY=1` + `rzp_test_` key; `dummy` stays forbidden in production) | **VERIFIED** by tests |
| Order-expiry scheduling (Vercel cron replacement) | **BLOCKED** — Cloud Scheduler job not created (needs billing and a backend URL; `gcloud` not installed on the dev machine). |
| CI (`.github/workflows/ci.yml`) | **IMPLEMENTED**; GitHub Actions results not checked. |
| Vercel leftovers (`vercel.json`, `vercel-build`, `.vercel*`) | Intentionally **kept** until the scheduler job exists. |

### Accounts / Environments

| Item | State |
|---|---|
| Firebase CLI as the client-owned account `verticalexpress01@gmail.com`; project `vertical-express` (202621320146) accessible | **VERIFIED** |
| Billing for `vertical-express` | **VERIFIED (2026-09-21):** open account `01840D-863F69-F7A1A0` linked, `billingEnabled: true`, Blaze active, App Hosting enabled. |
| App Hosting backend `ve-staging` | **VERIFIED created** (asia-southeast1, nodejs22); **not deployed**. 5 of 6 secrets set + granted; `database-url` pending. |
| Supabase staging project `vertical-express-staging` (Mumbai) | Created by the owner (reported). Credentials file **not present** on this machine: **BLOCKED**. |
| EAS project `@vertical-express/vertical-express` | **VERIFIED** reachable (Owner role). `development` and `preview` environments now hold the Firebase config files and Google client ID (they held nothing before). `EXPO_PUBLIC_API_URL` **not set** (no URL). Whether this is the *intended* project vs the older `imareebkhan-1` one is an **OWNER DECISION REQUIRED** (confirm). |
| Apple / Google Play developer accounts | **UNKNOWN** |
| Production Supabase project, production Firebase App Hosting backend, live Razorpay account, `verticalexpress.in` DNS | Not touched. Production site is currently **unreachable** (Vercel 402). |

---

## Environment Model

```
LOCAL
  developer machine
  local Postgres (test DB behind test-support/db-guard.mjs), dummy/test gateway,
  Firebase project `vertical-express` for identity (auth has no separate dev project)

STAGING
  Firebase App Hosting backend  `ve-staging`            (config: apphosting.yaml)
  isolated Postgres             Supabase `vertical-express-staging` (Mumbai)
  Razorpay TEST mode            PAYMENT_GATEWAY=razorpay-test + ALLOW_TEST_GATEWAY=1 + rzp_test_ keys
  Firebase Auth                 the existing `vertical-express` project (see note)
  EAS development / preview builds  →  EXPO_PUBLIC_API_URL = the staging backend URL

PRODUCTION
  Firebase App Hosting backend  `ve-prod`               (its OWN config; not apphosting.yaml)
  production Postgres           the existing production Supabase project
  Razorpay LIVE mode            PAYMENT_GATEWAY=razorpay-live, live keys, live webhook
  domain                        verticalexpress.in (DNS change — owner)
  EAS production / store builds
```

Rules:

1. **Staging must never silently point at the production database.** `scripts/staging-db.sh` enforces this for migrations (it refuses if the staging URLs match the production project ref). The App Hosting secrets script takes its database from `.env.staging`, never from `.env`. Never reuse a production URL to "get staging working".
2. `apphosting.yaml` is the **staging** config (test gateway, `ALLOW_TEST_GATEWAY`). A production backend needs its own file with `razorpay-live` and **no** `ALLOW_TEST_GATEWAY`.
3. Note — identity is shared: staging and production both use the one Firebase project `vertical-express` for Auth (it owns the phone/Google sign-in configuration). Test users created during staging exist in that same Auth project. Whether to add a separate Firebase project for staging identity is an **OWNER DECISION REQUIRED** (not needed for the first milestone).
4. The mobile app receives only public values (`EXPO_PUBLIC_*`, the Razorpay *key id* from the API response). No database credential, Razorpay secret or webhook secret ever enters the bundle.

---

## Phase 1 — Unblock Staging

Owner actions only; nothing is deployable until both are done.

| # | Action | Owner | Completion criterion (checked by running it) |
|---|---|---|---|
| 1.1 | Give the deploying account **access to `vertical-express`** (or log the CLI in as the client-owned account), then make sure its **billing account is open** and the plan is Blaze | Project owner (client-owned account) / Google Cloud billing | `firebase apphosting:backends:list --project vertical-express` returns a list (or "no backends") **without** a billing error |
| 1.2 | Save the staging connection strings as `homerun-clone/.env.staging` (gitignored) containing `DATABASE_URL` (pooler, 6543) and `DIRECT_URL` (direct/session, 5432) of the **`vertical-express-staging`** project | Project owner / Supabase account | `scripts/staging-db.sh status` prints the staging project ref and a migration status (i.e. the guard accepted it as *not* production) |
| 1.3 | (Optional, can wait) Confirm the intended EAS project (`vertical-express` vs older `imareebkhan-1`) | Project owner / Expo account | Owner confirmation recorded in `task.md` |

Do not paste credentials into chat. Do not start Phase 2 until 1.1 and 1.2 pass.

## Phase 2 — Deploy & Verify Staging

The runbook is `DEPLOY_FIREBASE.md`; this section lists the **gates**, not the commands. A step is done only when its evidence exists.

| # | Step | Evidence required |
|---|---|---|
| 2.1 | Guard, then apply all 18 migrations to staging | `migrate status` = up to date on **staging**; `payments_gateway_order_id_key` present |
| 2.2 | Seed **staging only** with the existing clearly fictional demo catalogue (owner approved) | Seed data is visibly test data (fictional brands/products), and the production database was not touched |
| 2.3 | Create App Hosting secrets, create backend `ve-staging`, deploy | A real `https://ve-staging--vertical-express.<region>.hosted.app` URL exists and the rollout succeeded |
| 2.4 | **Call the deployed URL** (a green build proves nothing): `/api/health` 200; `/api/v1/categories` 200; `/api/v1/products` 200; a protected endpoint without a token → **401**; the same endpoint with a **real Firebase ID token** → 200 | Recorded responses from the deployed host |
| 2.5 | Deployed Prisma → staging PostgreSQL connectivity | An endpoint that reads the database returns seeded data from the deployed host |
| 2.6 | Register the Razorpay **TEST** webhook on the deployed URL; verify signature handling without real money | Bad/missing signature → 400 on the deployed URL; a valid test-signed event is accepted |
| 2.7 | Create the protected order-expiry scheduler | Job exists; calling the endpoint without the secret → 401; a run expires an old pending order on staging |
| 2.8 | Set `EXPO_PUBLIC_API_URL` in EAS `development` and `preview` | `eas env:list` shows it; `/api/health` and `/api/v1/categories` reachable from that URL |
| 2.9 | Re-run gates | backend `tsc`, lint, full tests; mobile `tsc`, lint, full tests — all green |
| 2.10 | Add the deployed host to Firebase Auth authorised domains and set `NEXT_PUBLIC_SITE_URL`, roll out again | Web sign-in works on the staging host |

**Phase 2 exit:** every gate above has evidence from the *deployed* runtime.

## Phase 3 — First Real-Device Journey

Target journey, on a real iPhone **and** a real Android device, against the staging backend:

```
SIGN IN → BROWSE → PRODUCT → CART → ADDRESS → CHECKOUT
        → RAZORPAY TEST PAYMENT → CONFIRMATION → ORDER HISTORY
```

Steps:

1. EAS **development** builds for iOS and Android (iOS needs interactive Apple sign-in / credentials — **Apple developer account**; Android needs a keystore, which EAS can generate).
2. Verify the native Razorpay module is present in the build (not "unavailable"); resolve any iOS pod/static-framework issue the first build reveals.
3. Run the journey with Razorpay **test** payment methods only. Also exercise: payment cancelled, payment failed, app killed mid-checkout then relaunched (recovery), and a late payment on an expired order.
4. Record evidence (screenshots or logs) per step.

**Do not mark any journey step VERIFIED without actual iOS/Android runtime evidence.** Unit tests and API tests do not count for this phase. **Phase 3 exit:** the whole journey completes on both platforms, and the failure cases behave as designed.

## Phase 4 — Money Safety & Operations

Engineering work and business decisions are tracked **separately** below. Do not invent the business rules; each item lists what is needed from the owner. Statuses come from `KNOWN_ISSUES.md` (the authority) — where it says work exists, this is refinement, not a build-from-scratch.

| Area | Issue | Business decision (owner / accountant) | Engineering work (after the decision) |
|---|---|---|---|
| Refunds | ISS-025 (OPEN; partial mitigation — late captures are now recorded and listed) | Refund policy: window, who authorises, partial refunds, what applies to COD | `Refund` entity/workflow, operator screen over the late-payment worklist, call `refundPayment` only under that policy; `refund_initiated`/`refunded` are still unreachable in `order-flow.ts` |
| COD | ISS-010 (OPEN) | Whether COD is on, value limits, cash handover and reconciliation process | Collection and reconciliation flow. COD is currently gated off by a business setting. |
| Fulfilment / dispatch / delivery | ISS-009 (PARTIAL — "runs end to end; slots and order-state derivation remain"), ISS-014, ISS-015 (PARTIAL) | Delivery slots and SLA promises | Remaining slots and order-state derivation; audit-log coverage on money/stock actions |
| GST invoices | ISS-026 (BLOCKED — CA) | GST rates, HSN codes, invoice format — from the owner's chartered accountant | Invoice generation once rules are confirmed |
| Monitoring | ISS-012 (PARTIAL — wiring exists, credentials do not) | Create/own the Sentry and PostHog accounts | Set DSN/keys per environment; uptime workflow; alerting on `late_payment_captured` |
| Legal pages | ISS-017 (IN PROGRESS), ISS-018 (PARTIAL — canonical/sitemap host) | Approve legal copy; confirm canonical domain | Finish pages and links; fix canonical/sitemap host |

Other open items to be scheduled here as needed, referenced by ID only: ISS-006 (its text is stale relative to the Firebase phone/Google auth now in code — record verification when device-tested), ISS-027 (admin authorisation via env allowlist), ISS-029 (webhook handles only capture/failed events — partly addressed in code), ISS-030 (free-delivery threshold is a guess — owner).

**Phase 4 exit:** every P1 item above has an owner-approved rule and working, tested code, or an explicit owner decision to defer it past launch.

## Phase 5 — Production Launch

| # | Item | Notes / dependency |
|---|---|---|
| 5.1 | **Real catalogue** | ISS-007 (BLOCKED — owner). The current catalogue is entirely fictional and must be replaced with real, owner-supplied data. No fabricated data. |
| 5.2 | **Real serviceability / delivery zones** | Owner-confirmed pincodes, fees, ETAs, COD eligibility |
| 5.3 | Create `ve-prod` with its own config | Separate backend; no `ALLOW_TEST_GATEWAY`; `PAYMENT_GATEWAY=razorpay-live` |
| 5.4 | **Production database** | The existing production Supabase project. Before applying `20260920120000_payments_gateway_order_unique`, run the duplicate-check query in the migration's header and resolve any rows by hand. Migrations are applied by a person, never by the build (ISS-024). |
| 5.5 | Razorpay **live** configuration and live webhook | Owner's Razorpay account; live keys only in Secret Manager; explicit approval before any real-money activation |
| 5.6 | Production scheduler for order expiry | Same protected pattern as staging, against `ve-prod` |
| 5.7 | Canonical domain / DNS | Owner + DNS access; move `verticalexpress.in`; fix ISS-018 |
| 5.8 | Production monitoring | Sentry/PostHog/uptime wired for production |
| 5.9 | Production EAS builds and **app-store submission** | Apple/Google developer accounts; store listings; review |
| 5.10 | **Controlled first real order** | A small real order placed, paid (live), fulfilled and reconciled end to end by the owner before public launch |

---

## Production Gates

Every box must be **true and evidenced** before public launch. A gate that needs a deployed backend or a device is **not** satisfied by unit tests.

**Engineering gates**
- [ ] Backend `tsc`, lint and full tests green on the release commit (last run: 623/623)
- [ ] Mobile `tsc`, lint and tests green (last run: 61/61)
- [ ] Staging deployed on Firebase App Hosting; health, public API, 401 and real-Firebase-token API verified **on the deployed URL**
- [ ] Deployed backend reads/writes the staging PostgreSQL
- [ ] Razorpay TEST webhook verified on the deployed URL
- [ ] Order-expiry scheduler verified to expire a stale order
- [ ] iOS **and** Android journey verified on real devices (Phase 3), including cancel/fail/recovery/late-payment cases
- [ ] Production migration applied only after the duplicate check; `migrate status` up to date on production
- [ ] No test/dummy gateway reachable in production (`ALLOW_TEST_GATEWAY` unset on `ve-prod`; `razorpay-live` set)
- [ ] No secret in the repository or in a mobile bundle

**Business / operational gates**
- [ ] Real catalogue and delivery zones loaded (ISS-007) — no fictional data in production
- [ ] Refund policy decided and the refund/late-payment handling built or explicitly accepted as manual (ISS-025)
- [ ] COD decision made; if on, collection and reconciliation exist (ISS-010)
- [ ] GST invoicing rules confirmed by the CA and implemented (ISS-026)
- [ ] Legal pages live and correct (ISS-017); canonical domain correct (ISS-018)
- [ ] Monitoring and alerting live for production (ISS-012)
- [ ] Fulfilment loop complete enough to deliver a real order (ISS-009)
- [ ] Razorpay live activation explicitly approved by the owner
- [ ] Controlled first real order completed

---

## Known Issues / Decisions

Defined in `KNOWN_ISSUES.md` — **not redefined here**. The ones this roadmap depends on: **ISS-006** (auth channel; text stale vs current code), **ISS-007** (fictional catalogue — blocks launch), **ISS-009** (fulfilment — partial), **ISS-010** (COD), **ISS-012** (monitoring), **ISS-014/015** (order-state validation, audit log), **ISS-017/018** (legal, canonical host), **ISS-024** (migrations gated — fixed), **ISS-025** (refunds — open, partially mitigated), **ISS-026** (GST invoices — CA), **ISS-029**, **ISS-030**.

Decisions already taken (2026-09-20): Firebase App Hosting is the hosting target; staging uses a separate Supabase PostgreSQL; Razorpay stays in test mode until Phase 5; the demo catalogue may be seeded into **staging only**; the production domain is not moved yet; Vercel configuration is not deleted yet.

Open decisions: EAS project confirmation; separate Firebase project for staging identity (optional); refund/COD/GST/delivery-slot policies (Phase 4).

---

## Ownership / Human Checkpoints

| Owner | Needed for |
|---|---|
| **Project owner** | All policy decisions; approval before live Razorpay and before public launch; confirming the intended EAS project |
| **Firebase / Google Cloud account** | Opening the billing account (Blaze), enabling APIs, Cloud Scheduler, authorised domains |
| **Supabase account** | Staging project (done), `.env.staging` credentials; production project access for the production migration |
| **Razorpay account** | Test webhook registration now; live keys, live webhook and live activation later; rotating the pasted test secret |
| **Apple / Google Play developer accounts** | Development-build signing (iOS), store listings and submission |
| **Accountant / CA and business policy** | GST rates/HSN/invoice rules (ISS-026); refund, COD and return policy; delivery SLAs |
| **DNS / domain access** | Moving `verticalexpress.in` to the new backend |
| **Engineering (Claude Code)** | Everything else: migrations, deployment execution, verification, builds, code |

---

## Current Next Action

1. Rotate the exposed **staging-only** DB password securely. Update both local `.env.staging` URLs and the App Hosting `database-url` secret, preserving ref `gjhxhmcsuhxcmrvtkggz`, verified aws-0-ap-south-1 pooler and transaction/session settings. Never print values. If authorized API access is unavailable, isolate the dashboard reset as the owner action.
2. Re-run guard/connectivity/migration status after rotation. Roll out staging only if needed to consume the new secret; verify hosted auth/database binding after that change.
3. Resolve exposed Razorpay TEST API-secret rotation, then verify/configure the TEST webhook and authenticated five-minute order-expiry scheduler.
4. Verify resolved EAS development/preview staging configuration, run backend/mobile quality gates, then development builds and real-device E2E as hardware/accounts permit. Keep production EAS empty.
5. Keep policy and production boundaries explicit. Preserve WIP; no commit or push is authorized.
