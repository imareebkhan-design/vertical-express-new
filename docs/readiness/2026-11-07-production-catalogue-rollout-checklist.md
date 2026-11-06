# Production catalogue-only rollout checklist — 7 Nov 2026

**Scope.** Roll `ve-production` (www.verticalexpress.in) forward from its current build to
the integrated release head, in **catalogue mode only**: browsing, product pages and
enquiries. No orders, no payments, no COD.

**Not in scope, and not authorised by this checklist:** `COMMERCE_MODE=transactional`,
live Razorpay keys, merging PR #24 into `main`, any production data change, any schema
migration. Each of those needs its own written owner approval.

**Every step below that touches production needs the owner's written go-ahead for that
rollout, naming the exact commit.** Nothing here was run against production when this
was written.

## Facts this checklist relies on (checked 7 Nov 2026)

| Fact | Value |
|---|---|
| Production serving | `build-2026-11-02-002` (from draft PR #25), rollout SUCCEEDED 2 Nov |
| Production config | `apphosting.production.yaml`: `COMMERCE_MODE=catalogue`, `COD_DISABLED=1`, `PRODUCTION_IMAGE_DELIVERY=1`, no payment variables |
| Release head | `release/rc-2026-10-19` — record the exact SHA at go time |
| Runtime identity | `ve-production`: `firebase-app-hosting-compute@…`; `ve-staging`: `ve-staging-runtime@…` (separated 7 Nov, section C) |
| Secret access | Staging can no longer read `database-url-production` or `cron-secret-production` |
| Uptime checks | `www.verticalexpress.in/` and `/api/health`, each with an enabled alert policy |
| Error alert | "production runtime errors" policy, enabled, one notification channel |
| Images | 260 approved images mapped to version-pinned copies in `ve-production-product-images` (`lib/catalog/production-image-delivery.json`) |

## A. Go/no-go gates (all must be true)

- [ ] Owner has approved this rollout **in writing**, naming the release commit SHA.
- [ ] CI is green on that exact SHA: typecheck, lint, UI tests, design-system, assets,
      full backend suite, production build. Record the counts.
- [ ] The SHA contains PR #37 (image delivery, COD stop) and — if approved — PR #38 (admin
      audit, warehouse GUID). Do not deploy a feature branch.
- [ ] No pending migration: `prisma migrate status` against a **local restore** of a fresh
      production dump shows nothing to apply. (The release head adds no migration; confirm
      it still does not.)
- [ ] The same SHA has been deployed to `ve-staging` and section F passed there.
- [ ] Step B (fresh image-hash verification) passed **on the same day** as the rollout.
- [x] Step C (IAM separation) — done 7 Nov 2026.
- [ ] Someone is available for 60 minutes after rollout to run section F and roll back.

## B. Fresh image-hash verification (no production writes)

1. Take a read-only public-schema dump of production (`pg_dump -Fc --no-owner
   --no-privileges --schema=public`, `DIRECT_URL` from the production env). Store it
   outside git; it contains customer data.
2. Restore into a new, uniquely named local database. Never reuse an older restore.
3. Record an independent hash of `product_images` before:
   `select md5(string_agg(t::text,'|' order by id)) from product_images t`.
4. Run `scripts/verify-image-delivery.mts` with `DATABASE_URL`/`DIRECT_URL` pointing at the
   local restore and `VE_TEST_DATABASE=1` (it refuses remote databases).
   Pass = `pinnedBytesVerified` equals the approved staging-bucket image count,
   `visibleProducts` = `detailAndCardChecks` = `rollbackChecks`, `databaseWrites: 0`.
5. Re-hash `product_images`; it must equal step 3.
6. **If the script reports a missing mapping**, an approved image was added since the
   manifest was built. Stop. Copy it to `ve-production-product-images`, record its pinned
   generation and SHA-256 in the manifest, merge that through review, and start again.
7. Confirm the bucket has object versioning on and no lifecycle rule that would delete
   pinned generations: `gcloud storage buckets describe gs://ve-production-product-images
   --format="value(versioning,lifecycle)"`.

Last verified: 6 Nov 2026 on `ve_readiness_restore_20261106` — 260/260 hashes, 260
visible, 260 rollback checks, 6 search checks, 324 image rows unchanged.

## C. Production/staging IAM separation — DONE 7 Nov 2026 (owner approved)

Done by moving **staging** to its own identity, so production needed no rollout.
Production's runtime, revision and secrets are unchanged.

- Created `ve-staging-runtime@vertical-express.iam.gserviceaccount.com` with the four
  project roles the shared account held (`firebaseapphosting.computeRunner`,
  `firebase.sdkAdminServiceAgent`, `storage.objectViewer`,
  `developerconnect.readTokenAccessor`), and `secretAccessor` + `viewer` on the 11
  secrets staging's live service references. App Hosting's service agent may act as it.
  (`viewer` is required: the build reads secret version metadata.)
- `ve-staging` backend now runs as that account; staging redeployed from the release
  head (`build-2026-11-06-004`), health, storefront, COD-off and the signed-in admin
  inbox verified.
- Removed the shared account (still production's) from the five staging-only secrets:
  `cron-secret`, `database-url`, `google-maps-browser-key-staging`,
  `razorpay-key-secret`, `razorpay-webhook-secret`.

Who can read what now:

| Secret | Production | Staging |
|---|---|---|
| `database-url-production`, `cron-secret-production` | yes | **no** |
| `database-url`, `cron-secret`, `razorpay-*`, `google-maps-browser-key-staging` | **no** | yes |
| `admin-emails`, `firebase-client-email`, `firebase-private-key`, `google-*-api-key` | yes | yes |

Residual, accepted for now:
- Both environments share one Firebase project, so they share the Firebase Admin key
  and the Google API keys. Full isolation would need a separate Firebase project.
- Production still runs as the project's *default* App Hosting account. Any new backend
  created without an explicit service account would default to it and could read the
  production database URL. Create future backends with `--service-account`.

Rollback: `iam-before/` snapshots (project and every secret policy, taken before the
change) are held outside git. To revert, PATCH `ve-staging`'s `serviceAccount` back to
`firebase-app-hosting-compute@…`, re-add that account as `secretAccessor` + `viewer` on
the five staging-only secrets, and redeploy staging.

## D. Rollout

1. Record the currently serving build (`build-2026-11-02-002` today) — it is the rollback
   target.
2. Back up production first (read-only dump as in B.1), named with the date and purpose.
3. Deploy a **clean snapshot** of the approved SHA, never a working tree: `git archive`
   the commit into an empty temporary directory and run, from there, a pinned CLI
   (`npx --yes firebase-tools@15.35.0 deploy --only apphosting:ve-production
   --project vertical-express --non-interactive`). Name the backend — `firebase.json`
   lists staging and production. This mirrors `npm run deploy:staging` (PR #38), which
   exists because a direct deploy from a feature branch once replaced staging's audit
   and warehouse fixes; there is no production equivalent of that guard yet.
   Staging for gate A must likewise come from `npm run deploy:staging` on the release head.
4. Confirm the new rollout reaches SUCCEEDED and 100% of traffic.

## E. Rollback

- **Application:** roll traffic back to the recorded previous build in the App Hosting
  console (Rollouts → previous build → Roll back), or redeploy the previous verified
  commit. No data rollback is needed: this release changes no data.
- **Image delivery only:** set `PRODUCTION_IMAGE_DELIVERY=0` (BUILD and RUNTIME) in
  `apphosting.production.yaml` and rebuild. Pages fall back to the original image URLs;
  no reapproval is needed. A rebuild is required because pages are prerendered.
- **COD:** stays disabled on rollback. That is the owner's business decision (4 Nov), not a
  test switch.
- Rollback trigger: any section F check fails, health check alert fires, or error rate
  rises above the pre-rollout baseline.

## F. Post-deployment verification (production, read-only)

Desktop and a 375px phone viewport, signed out unless stated:

- [ ] `/` and `/api/health` return 200; health says `ok`.
- [ ] `/categories` lists the four departments; empty categories say "Coming soon";
      an unknown category returns 404.
- [ ] A stocked category lists products; images load from
      `storage.googleapis.com/ve-production-product-images/…?generation=…`
      (check the network panel). No CSP violations in the console.
- [ ] Three product pages: gallery images load; no price, stock or basket action is
      shown on catalogue-only products; the enquiry action is reachable from the sticky
      bar on mobile.
- [ ] Search suggestions show images from the production bucket.
- [ ] **Ordering is closed:** `/cart` and `/checkout` cannot place an order; the
      `/api/v1` order and payment endpoints the Expo app uses refuse with the
      ordering-closed error. No Razorpay script is loaded on any page.
- [ ] **Mobile payment flow:** on the phone viewport, no path reaches a payment step; if
      a checkout screen is reachable, it shows no Pay-on-Delivery option and no online
      payment can start.
- [ ] `/api/serviceability/190001` reports `codAllowed: false`.
- [ ] Owner signs in to `/admin/enquiries`, sees the inbox, and can filter by status.
      **Do not submit a test enquiry in production** unless the owner asks; if one is
      submitted, mark it spam and note its number.
- [ ] Monitoring: uptime checks stay green for 30 minutes; the runtime-error policy has
      not fired. Confirm the owner has actually received one test notification from the
      channel (not yet verified as of 7 Nov).

Record results, the build ID, timestamps and any screenshots (no customer data) in
`docs/readiness/` for the rollout date.

## G. Still blocking a paid launch (not this rollout)

Legal entity and public contact details; delivery and returns policies; launch SKU
prices/MRP and physical stock; Razorpay live account and keys; live payment, refund and
fulfilment acceptance; COD policy if it is ever re-enabled. See
`docs/OWNER_INPUT_REQUIRED.md`.
