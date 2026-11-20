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
- `/admin/enquiries` signed out redirects to sign-in. **Signed-in owner inbox on
  production not checked** (requires the owner's sign-in); verified on staging.
- Monitoring: both uptime checks passing (143/143, 142/142 points in the window).
  8 HTTP 500s on the raw `run.app` URL at 04:25Z, all "Failed to find Server Action"
  from clients holding the previous build's action IDs — the expected transient after a
  Next.js deploy; none on the public domain. They **fired the "production runtime
  errors" alert policy** (incident opened 04:25:57Z for revision
  `ve-production-build-2026-11-06-001`), so alerting works through to notification on
  the owner's email channel. Whether that email arrived in the owner's inbox is still
  unconfirmed (the Gmail connector was disconnected).

## Rollback

App Hosting console → `ve-production` → Rollouts → `build-2026-11-02-002` → Roll back.
Image delivery alone: set `PRODUCTION_IMAGE_DELIVERY=0` (BUILD and RUNTIME) and rebuild.
No data rollback is needed; this rollout changed no data. COD stays disabled.

## Still blocking a paid launch

Legal entity and public contact details; delivery and returns policies; launch prices/MRP
and physical stock; Razorpay live account and keys; live payment, refund and fulfilment
acceptance; owner's signed-in production inbox check; alert receipt test.
