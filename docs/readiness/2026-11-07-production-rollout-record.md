# Production catalogue-only rollout — record, 7 Nov 2026

Carried out against `docs/readiness/2026-11-07-production-catalogue-rollout-checklist.md`,
under the owner's instruction to complete the rollout unattended. Catalogue mode only:
no orders, no payments, no COD. PR #24 not merged; no live payment configuration.

## What was deployed

| | |
|---|---|
| Commit | `f853f86` (`release/rc-2026-10-19`, contains PR #37 and PR #38) |
| Method | `git archive` of the clean, fetched release head into an empty directory; `npx firebase-tools@15.35.0 deploy --only apphosting:ve-production` |
| Build | `build-2026-11-06-001`, revision `ve-production-build-2026-11-06-001`, 100% traffic |
| Previous (rollback target) | `build-2026-11-02-002` |
| Runtime identity | `firebase-app-hosting-compute@…` (production); staging separated earlier the same day |

## Gates (section A)

- CI green on `f853f86`: push and PR runs, UI 218/218, backend 1474/1474, plus a local re-run with the same counts.
- Migrations: all 37 repository migrations already applied in production; nothing pending. Production also records one older migration (`20260714204107_rls_lockdown`) that is no longer in the repository; harmless for a deploy that runs no migrations.
- Staging ran the same commit (`build-2026-11-06-004`, own runtime account) and passed health, storefront, COD-off, mobile checkout and signed-in admin checks.
- Production config diff (release vs live): only `PRODUCTION_IMAGE_DELIVERY=1`, `COD_DISABLED=1`, the production image bucket and the previous-bucket allowance changed. `COMMERCE_MODE=catalogue` unchanged.

## Backup and image verification (section B, same day)

- Read-only public-schema dump taken before the rollout (49 tables), held outside git.
- Restored to new local database `ve_rollout_restore_20261107`; `product_images` hash
  `d0e8df85…` (identical to 6 Nov) before and after.
- `scripts/verify-image-delivery.mts` (release code): 260/260 pinned hashes, 260 visible
  products, 260 card/PDP checks, 260 rollback checks, 6 search checks, 324 image rows
  unchanged, 0 database writes.
- `ve-production-product-images`: versioning on, no lifecycle rule.

## Post-deployment verification (section F)

- Status codes identical to the pre-rollout baseline: `/`, `/categories`, `/api/health`
  (`ok`), `/search`, three product pages and `/category/cement` 200; unknown category 404;
  `/cart` 200; `/checkout` 307.
- Images moved from `ve-staging-product-images` (before) to
  `ve-production-product-images?generation=…` (after) on home, search and product pages.
  Desktop PDP 7/7 and phone PDP 8/8 images loaded; no console or CSP errors; CSP
  `img-src` names the production bucket path.
- No price, no basket action and no Razorpay script on catalogue products; phone sticky bar
  shows "Price on request" and an "Enquire" action that reaches the enquiry form.
- `/api/serviceability/190001`: `codAllowed: false`.
- `/api/v1/cart/items` and `/api/v1/checkout/orders` refuse; no cart or order rows created.
- `/admin/enquiries` signed out redirects to sign-in. Signed-in owner inbox and
  status filtering verified in the acceptance follow-up below.
- Monitoring: both uptime checks passing (143/143, 142/142 points in the window).
  8 HTTP 500s on the raw `run.app` URL at 04:25Z, all "Failed to find Server Action"
  from clients holding the previous build's action IDs — the expected transient after a
  Next.js deploy; none on the public domain. They **fired the "production runtime
  errors" alert policy** (incident opened 04:25:57Z for revision
  `ve-production-build-2026-11-06-001`), so alerting works through to notification on
  the owner's email channel. Inbox receipt subsequently verified in the browser
  during the acceptance follow-up below.

## Rollback

App Hosting console → `ve-production` → Rollouts → `build-2026-11-02-002` → Roll back.
Image delivery alone: set `PRODUCTION_IMAGE_DELIVERY=0` (BUILD and RUNTIME) and rebuild.
No data rollback is needed; this rollout changed no data. COD stays disabled.

## Acceptance follow-up — 7 Nov 2026, 19:44–19:50 IST

- Read-only recheck: `/api/health` returned HTTP 200 with `status: ok` at
  `2026-11-07T14:14:42.179Z`; production still reports
  `ve-production-build-2026-11-06-001` as its latest ready revision.
- `/api/serviceability/190001` still returns `codAllowed: false`.
- Production `/admin/enquiries` redirects the signed-out browser to
  `/login?next=%2Fadmin%2Fenquiries`. Google account selection opened successfully.
  The owner identified the operator account; its authenticated session displayed
  the Product enquiries inbox. All-status view and the applied `?status=new`
  filter both loaded successfully with "No enquiries yet". This verifies access,
  filter navigation and the empty state; populated-row handling was not exercised.
  No enquiry was submitted or changed.
- Email receipt verified in the owner's Gmail browser session. Search
  `in:anywhere after:2026/11/06 "production runtime errors"` found the Google Cloud
  Alerting message in Inbox, received 7 Nov at 09:55 IST, for project
  `vertical-express`, service `ve-production`, revision
  `ve-production-build-2026-11-06-001`, condition "Production application error log".
  This matches the recorded incident. No new alert or email was sent.
- No deployment, configuration change, order, payment or production data mutation
  was performed during this follow-up.

## GitHub/Firebase reconciliation — 7 Nov 2026

- Canonical GitHub release head at verification: `51a2da8`; compared with the
  deployed `f853f86`, its only differences are the two rollout documents in
  `docs/readiness/`. No application, dependency, schema or deployment-config changes.
- Downloaded the source archive recorded by successful production Cloud Build
  `a82e3d6d-7e09-4215-848d-47c96d127ccf` and compared its bytes with `git archive
  f853f86`: 1,050 matching files, zero changed files, zero extra files. Five tracked
  files were omitted by the explicit Firebase ignore rules (`.env.*` examples,
  `.vercel-old/` and `mobile-shell/`).
- Firebase/Cloud Run reports `ve-production-build-2026-11-06-001` ready and serving
  100% of production traffic. All application changes in this release are already
  live; a documentation-only difference does not require another rollout.

## Still blocking a paid launch (unchanged)

Legal entity and public contact details; delivery and returns policies; launch prices/MRP
and physical stock; Razorpay live account and keys; live payment, refund and fulfilment
acceptance. The signed-in production inbox and alert-receipt checks are complete.
