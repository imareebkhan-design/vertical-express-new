# Deploying to Firebase App Hosting

> Status, environment model, gates and the phased path to production live in [`PRODUCTION_ROADMAP.md`](PRODUCTION_ROADMAP.md). This file is the operational runbook only.

Vercel is no longer the deployment target (its project returns `402 DEPLOYMENT_DISABLED`).
The same Next.js app — website, `/api/v1`, webhooks — runs on **Firebase App Hosting**
(Cloud Run + Cloud Build). Database (Supabase PostgreSQL), Prisma, Firebase Auth and
Razorpay are unchanged.

Project: **`vertical-express`** (the project that already owns the app's Firebase Auth —
`FIREBASE_PROJECT_ID` and the mobile `google-services.json` point at it).
Backend id: **`ve-staging`** — a TEST backend. Config: `apphosting.yaml`, `firebase.json`, `.firebaserc`.

## Compatibility (checked against this repository)

| Area | Result |
|---|---|
| Next.js 15.5.23 | COMPATIBLE — App Hosting's Next adapter runs it on Cloud Run |
| Node | REQUIRES CONFIG — `engines.node >=22` added (CI/local use 24) |
| Prisma 7 + `@prisma/adapter-pg` | COMPATIBLE — plain TCP to Postgres; `prisma generate` runs in `postinstall` |
| Firebase Admin | COMPATIBLE — explicit service-account env (no ADC fallback); 3 vars via Secret Manager |
| Route handlers / webhook raw body | COMPATIBLE — the Razorpay route uses `req.text()` |
| Middleware | COMPATIBLE — cookie *presence* check only; no Node/Edge-only APIs |
| Filesystem | COMPATIBLE — no runtime file writes |
| Build | COMPATIBLE — App Hosting runs `npm run build`; the `prebuild` dev-server guard does not fire on a clean builder |
| `generateStaticParams` at build | REQUIRES CONFIG — queries Prisma, so `DATABASE_URL` is a BUILD-time secret and the DB must be reachable from Cloud Build |
| Session cookie | COMPATIBLE — named `__session`, the one cookie Firebase's CDN forwards to the backend |
| Reserved env names | REQUIRES SMALL CODE CHANGE — App Hosting **rejects env vars starting `FIREBASE_`** (also `X_GOOGLE_`, `EXT_`, `KIT_`). Found at first use, not in the original audit. The Firebase Admin credentials are therefore supplied as `FB_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`; `lib/auth/firebase-admin.ts` reads those first and still accepts the legacy `FIREBASE_*` names (verified with a real ID token). `NEXT_PUBLIC_FIREBASE_*` is unaffected. |
| Payments guard | REQUIRES SMALL CODE CHANGE — App Hosting always runs `NODE_ENV=production`, which refused the test gateway. Added the guarded `ALLOW_TEST_GATEWAY=1` opt-in (only with `rzp_test_` keys; `dummy` stays forbidden). Tested. |
| Vercel-specific code | none in `app/`, `lib/`, `actions/` — only `vercel.json` (cron) and the `vercel-build` script |
| Cron | REQUIRES REPLACEMENT — Cloud Scheduler (below) |

## Before anything: owner actions

1. **Get the billing account for `vertical-express` open and the project on Blaze** — <https://console.firebase.google.com/project/vertical-express/usage/details> (and <https://console.cloud.google.com/billing>).
   Verified blocker (latest, 2026-09-20): `firebase apphosting:backends:list` fails with
   *"HTTP 400 … Billing account for project '202621320146' is not open"* (earlier it said *"must be on the Blaze plan"*). A billing account is linked but not open.
   (Also required for Cloud Run, Secret Manager and Cloud Scheduler.)
2. **Staging database — DECIDED: a separate Supabase project** (see §Staging database). The staging
   backend must never point at the production project `gsfslnxvwmrgulzqypdp`.
3. Confirm Supabase accepts connections from Google Cloud (no network allow-list blocking it).

## Staging database

Decision (owner, 2026-09-20): `ve-staging` uses its **own** PostgreSQL, isolated from production.
Existing provider, safest option: a **new Supabase project** in the same org and region (`ap-south-1`),
named e.g. `vertical-express-staging`. (No Supabase CLI or access token is configured on this machine, so
creating it is a dashboard action.)

Owner steps:
1. Supabase dashboard → New project → `vertical-express-staging`, region **South Asia (Mumbai)**, set a database password.
2. Project → **Connect**: copy the *Transaction pooler* URL (port 6543) and the *Direct/Session* URL (5432).
3. Put them in a new file `homerun-clone/.env.staging` (gitignored — `.env*`; never paste them into chat):
   ```
   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
   ```
Then: `scripts/staging-db.sh migrate` applies every migration (including the `gateway_order_id` unique index) and
prints `migrate status`. The script **refuses** to run if the URLs point at the production project or at two
different projects (tested). The full 18-migration chain was rehearsed on an empty local database: all applied,
status "up to date", unique index present.

The staging database starts **empty** — no catalogue is fabricated for it. To exercise the journey it needs
products, a warehouse and a serviceable pincode; the repo's `prisma db seed` provides a clearly fictional demo
set (used by CI). **Decided (owner, 2026-09-20): load it into staging only** — never production. Status and gates: `PRODUCTION_ROADMAP.md`.

## Runbook

```bash
cd homerun-clone
firebase login                                  # already done as imareebkhan@gmail.com
firebase use vertical-express                   # .firebaserc already defaults to it

# 1. migrate the staging DB (see above), then secrets (values never printed) from .env.staging
scripts/staging-db.sh migrate
scripts/apphosting-secrets.sh .env.staging

# 2. create the backend, then grant it the secrets (command printed by the script)
npx -y firebase-tools@latest apphosting:backends:create --backend ve-staging \
     --primary-region <region>   # closest offered to Mumbai (DB is ap-south-1): asia-south1 if listed, else asia-southeast1

# 3. migrations are applied by hand (step 1) — NEVER from the build (see Migrations)

# 4. deploy
npx -y firebase-tools@latest deploy --only apphosting
```

**Backend created 2026-09-21:** `ve-staging`, region **`asia-southeast1`** (App Hosting offers only asia-east1, asia-southeast1, europe-west4, us-central1, us-east4, us-east5 — `asia-south1`/Mumbai is not available; Singapore is closest), runtime nodejs22, URL `https://ve-staging--vertical-express.asia-southeast1.hosted.app` (serves nothing until the first rollout). Secrets created and granted: `firebase-client-email`, `firebase-private-key`, `razorpay-key-secret`, `razorpay-webhook-secret`, `cron-secret`. **Still missing: `database-url`** (needs the real `.env.staging`).

After the first rollout the backend has a URL of the form
`https://ve-staging--vertical-express.<region>.hosted.app`. Then:
- set `NEXT_PUBLIC_SITE_URL` to it (in `apphosting.yaml`) and roll out again;
- add the host to Firebase Auth **Authorized domains** (web sign-in) — `firebase.json` `auth.authorizedDomains`;
- set `EXPO_PUBLIC_API_URL` in `mobile/eas.json` (development + preview profiles) to it.

## Migrations

The build does **not** touch the database and must not. `vercel-build` (with `predeploy-migrations.mjs`, the
ISS-024 gate) is not used by App Hosting, which runs `npm run build`. Apply migrations deliberately from a
machine with `DIRECT_URL`: `npm run db:deploy`.

**Pending migration `20260920120000_payments_gateway_order_unique`** makes `payments.gateway_order_id` unique.
It FAILS if duplicates exist (intended). Before applying it to any shared/real database run:

```sql
SELECT gateway_order_id, count(*) FROM payments
WHERE gateway_order_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
```
and resolve any rows by hand. It has been applied only to the local test database.

## Razorpay (TEST mode)

Webhook URL to register in the Razorpay dashboard (test mode):
`https://<backend-host>/api/webhooks/razorpay`, events `payment.captured`, `payment.failed` (and `order.paid`).
The webhook secret is generated by `scripts/apphosting-secrets.sh` into the gitignored `.env.local.secrets`
(`RAZORPAY_WEBHOOK_SECRET`) and stored as the `razorpay-webhook-secret` secret; paste the **same** value into
the dashboard. Live mode is not configured and needs the owner's approval.

## Order-expiry cron (replaces `vercel.json`)

`/api/cron/cleanup-orders` (Bearer `CRON_SECRET`, 15-minute expiry, idempotent) must run every 5 minutes.
Cloud Scheduler HTTP job (needs the Cloud Scheduler API and Blaze):

```bash
gcloud scheduler jobs create http ve-cleanup-orders \
  --project vertical-express --location <region> --schedule "*/5 * * * *" \
  --uri "https://<backend-host>/api/cron/cleanup-orders" --http-method GET \
  --headers "Authorization=Bearer $(grep ^CRON_SECRET= .env.local.secrets | cut -d= -f2)"
```
The endpoint stays protected: without the header it answers 401. Note `gcloud` is not installed on the
current dev machine; the same job can be created in the Cloud Console (Cloud Scheduler → Create job).

## Vercel leftovers (remove once the new backend is verified live)

`vercel.json` (its only content is the cron now replaced), the `vercel-build` script, `.vercel/`, `.vercel-old/`.
Left in place until the Cloud Scheduler job exists, so there is never a moment with no expiry job configured.

## Production later

A separate backend (`ve-prod`) with its own config: `PAYMENT_GATEWAY=razorpay-live`, no `ALLOW_TEST_GATEWAY`,
live Razorpay secrets, the production database, `verticalexpress.in` as a custom domain (DNS change = owner).

## EAS (mobile builds)

The EAS project `@vertical-express/vertical-express` had **no environment variables**. Created for the
`development` and `preview` environments (2026-09-20): `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST`
(file, sensitive) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Still to add once the backend URL exists:
`EXPO_PUBLIC_API_URL` (`eas env:create --name EXPO_PUBLIC_API_URL --value https://<backend-host> --environment development --environment preview`).
`production` was left empty on purpose.
