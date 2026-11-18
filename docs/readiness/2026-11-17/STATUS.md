# Production readiness — 17 November 2026

## Verdict

Paid ordering remains NO-GO. This is an engineering candidate, not a production deployment or commercial approval. Owner requested autonomous completion; no prices, stock, tax, delivery policy, operator identity or refund policy was inferred.

## Candidate

Release base for PR #76 is `e128241`. The PR changes session request validation (ISS-109), booking budgets (ISS-110) and the staging security smoke exit criteria.

Reporting is tracked under merged PRs #73 (Today) and #74 (Reports). PR #79 added Check payment. Validate the three admin surfaces on the release candidate using the staging payment and refund ledger as the reference.

## Validation

- 22 targeted session/booking/smoke regressions pass.
- Application typecheck and lint pass.
- 276/276 UI tests pass after integration.
- Design-system and asset guards pass.
- Full backend suite runs only against newly created local database ve_readiness_20261117; result pending below.
- Production build will run in CI against its disposable database. Local build omitted because less than 1 GB disk is free.
- No shared database migration, hosting rollout, live payment or store submission.

## Security report reconciliation

The supplied 16 November Codacy CSV has 190 rows: 37 critical, 78 high, 52 medium and 23 low; 88 app and 102 workspace findings. These are scanner findings, not 190 proven exploitable defects. The report includes older revisions, tests and local scripts. PR #75 already patched major app dependencies, randomness and JSON-LD sinks; this candidate fixes two additional application defects recorded during that review.

Current app npm audit --omit=dev: 10 affected packages (0 critical, 4 high, 6 moderate), largely Firebase/Firestore gRPC and Sentry bundler dependencies. Firebase's Firestore pins an old gRPC range; a forced downgrade from Firebase 12 to 9 is not an acceptable fix. No claim of zero advisories or full penetration testing is made.

Mobile candidate: workspace PR #29 integrates existing #22/#24/#25, patches four transitive tooling packages and adds CI. Fresh-install Mobile quality CI passed on aef3fda. It reduces the mobile audit from 29 affected packages (1 critical) to 25 (0 critical, 11 high, 14 moderate). Mobile native/device acceptance remains separate.

Sources: supplied Codacy export; npm audit JSON generated during this session; https://github.com/advisories/GHSA-pqg4-j6r4-53mv ; https://github.com/advisories/GHSA-m9gg-hp2v-232j ; https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html .

## Repository safety

App main and release/rc-2026-10-19 now require the GitHub Actions verify check on an up-to-date branch, a PR, resolved review conversations, and disallow force pushes/deletion, including for admins. Approving-review count remains zero for the single-owner workflow. The GitHub API returned the configured protections successfully. Rollback is restoring the prior unprotected state through repository settings, not changing application code.

Workspace main protection is blocked by GitHub plan: API returned 403, requiring GitHub Pro for this private repository. The repository was not made public and no paid plan was purchased.

## Remaining launch gates

| Gate | State / next concrete requirement |
|---|---|
| A-1 candidate CI | Full verify on the final app candidate, then exact integrated release SHA |
| A-2 / A-3 / A-5 | In release; staging acceptance still required |
| A-4 / B-1 notifications | Code exists; owner must name recipient/channel and configure provider/error-tracker secrets, then verify actual delivery and missed-job alert |
| A-6 staging | Reviewed candidate, backup, payment_exceptions migration, rollout and payment/auth/image/expiry/concurrency acceptance; real test-account and provider interactions needed |
| B-2 reporting | Existing work integrated here; regression validation pending full suite; no staging claim |
| B-5 refunds / partial delivery | Owner's returns, delivery-fee and partial-delivery policy required before implementation |
| B-6 operator tiers | Production operator/owner assignments and permission policy required; current single-tier model remains open (ISS-111) |
| B-7 GST invoice | Accountant's rates, HSN, invoice requirement/format/number series required |
| B-8 / B-9 mobile | Deletion/retention policy, new build and physical-device journeys; Apple/store/background-location decisions remain open |
| D-4 protection | App done; private workspace blocked by account plan |
| D-5 restore rehearsal | New production backup/restore evidence required before launch; disk headroom currently inadequate for a fresh restore/build |
| Dependency hygiene | Remaining app and mobile high/moderate advisories require compatible upgrades and validation; not waived |
| Commercial/legal | Approved SKU prices/MRP/counts, GST/HSN, service areas/fees/times, legal/support details and live Razorpay configuration remain owner/accountant inputs |
| Production launch | Catalogue-only until all gates pass and owner approves deployment and opening paid orders |

Post-launch roadmap items are not silently marked complete: payment-check control, audit UI, product/stock/ledger controls, account deletion, remaining rate-limit/validation/RLS work, CSP cleanup, outbox handling, and native crash reporting still need implementation or verification as scoped in roadmap 08. No Phase E expansion was started.

## Rollback

Revert this candidate's feature commits; no schema migration introduced by this branch. Its base includes the earlier payment_exceptions migration, which must be backed up and applied before staging rollout. Do not roll back shared data as part of a code revert.
