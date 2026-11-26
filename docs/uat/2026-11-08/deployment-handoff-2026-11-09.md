# Client UAT deployment handoff — 9 November 2026

This is the current deployment record. Earlier reports preserve historical browser
observations; they are not claims that every journey passed on this release.

## Delivered

- Staging: https://ve-staging--vertical-express.asia-southeast1.hosted.app
- Deployed application source: `ea02aac` on `release/rc-2026-10-19`.
- Firebase Cloud Build `4f19c553-1322-4b46-b63e-9be8f8cfeb9a`: SUCCESS.
- Staging revision `ve-staging-build-2026-11-08-001`: 100% traffic.
- Runtime: staging with `razorpay-test`. No live payment gateway enabled.
- Reviewed and merged PRs #49 (cart refresh race), #51 (admin cancellation
  confirmation), #52 (QA stock initializer rerun protection), #53 (local font
  build), and #46 (additional synthetic catalogue, including #52).
- PR #45's test-only seed approvals were reconciled with Claude's work. The last
  public API inspection returned 27 purchasable test products: 23 approved seed
  products and four QA fixtures. These are not commercially verified prices.
- Production remains `ve-production-build-2026-11-07-001`, 100% traffic,
  `COMMERCE_MODE=catalogue`, without payment gateway configuration. No production
  deployment or data change was made during this continuation.

## Validation and limits

| Check | Result |
|---|---|
| Integrated UI regression suite | 225/225 passed |
| QA catalogue, UAT approvals and inventory backend tests | 14/14 passed on a fresh local test database |
| Production build and lint | Passed |
| Post-deployment anonymous smoke, phone 380px and desktop 1440px | 14/14 passed (27.0 seconds) |
| Earlier authenticated unpaid checkout and cancellation | Passed; evidence in [resumed verification](resumed-verification.md), stock 50 → 49 → 50 |
| Captured TEST payment, provider failure, webhook and refund | Not passed; provider contact validation blocked the previous browser run |
| Native installed-device journeys | Not tested; no connected Android device |

An initial backend run reused a database containing earlier approval audit rows and
failed two count assertions. A fresh guarded local database was seeded and all 14
focused tests passed. No remote initializer was rerun. This is not a fresh full
backend suite claim. The merged fixes have regression coverage; the local font
build also passed type checking, design and asset checks before integration.

The smoke suite performs anonymous reads only: health/API, home, every linked
category, a product, its trading-mode action, missing-product 404 and search. It
cannot establish login, checkout, payment or fulfilment acceptance.

## Android client artifact

Claude already completed the internal Android UAT build; no duplicate build was
requested or charged during this continuation.

- [Build and install page](https://expo.dev/accounts/vertical-express/projects/vertical-express/builds/43370e7b-64e3-4f7c-8172-28a63e203d24)
- [APK download](https://expo.dev/artifacts/eas/hIPDlEjADxHGbzXc3cKgdch_YDdsRqp05K3JxEZvd-Q.apk)
- Build ID `43370e7b-64e3-4f7c-8172-28a63e203d24`; FINISHED; internal `uat`
  profile; application 1.0.0, build 4; workspace source `6b0f8d05e70c59b7464e2754029ec53174b643b0`.
- APK SHA-256: `0e29b189bbc0e3b324ef70902ede9be04fd862f1c996fd0420487379d12bfb17`.
- Resolved UAT configuration and downloaded APK JavaScript bundle contain the
  staging endpoint; the production website hostname is absent from that bundle.
  This static inspection does not prove runtime requests or successful installation.
- iOS simulator profile exists; no installed iOS test build was verified here.

## Next acceptance checks

Use the [client guide](client-guide.md) and [configuration map](configuration-map.md).
An authorized tester must complete Razorpay's contact step and use TEST methods
only. Do not supply an arbitrary real person's contact or bypass validation.
Complete simulated success/failure, webhook confirmation, paid cancellation and
refund, expiry cleanup, and fulfilment status transitions. Fresh authentication,
address creation, enquiries, permission isolation and installed Android journeys
also remain. No interactive browser control or connected phone was available in
this continuation, so these results have not been invented.

**Ready to share for controlled client testing; not acceptance-passed or ready for
commercial ordering.** Live merchant credentials, verified catalogue/GST values,
legal/business contacts, delivery terms and final policy decisions remain launch
gates. No real deliveries or real payment testing is authorized by this handoff.

For rollback, use the documented Firebase deployment procedure and a previously
reviewed release. Do not reset stock or rerun initializers as a deployment step.
