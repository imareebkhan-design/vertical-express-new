# PR #38 — staging verification and review corrections

## Completed staging verification

Verified through the authenticated operations console on 6 November 2026, on
commit `5fb6fa9117297287d107c282131308c69b35365b`:

- Backend `ve-staging`, revision `ve-staging-build-2026-11-06-001`.
- Cloud Build `724f4149-3579-4416-9a60-90c8ab36fb0c`; rollout succeeded.
- Console: <https://ve-staging--vertical-express.asia-southeast1.hosted.app/admin/stock-ledger>.
- QA-STAGING-1 at Srinagar Central: recount 13 → 14, then correction 14 → 13.
- Final state independently checked in a staging read-only database transaction:
  13 on hand, 0 reserved.
- Both ledger movements identify the same verified operator. Actor identity and
  contact details are redacted here; no credentials or customer data are included.

| Audit event | Before | After | Delta | Audit record |
|---|---:|---:|---:|---|
| inventory.recounted | 13 | 14 | +1 | 537716e9-c35c-4aa2-b2ba-064ceb925b48 |
| inventory.adjusted (correction) | 14 | 13 | -1 | 63b69490-7ff6-4d1e-a81a-62f0f884d984 |

Stored audit timestamps are respectively `2026-11-06T07:37:00.550Z` and
`2026-11-06T07:37:20.963Z` (13:07 IST). The database stores these values in UTC;
they follow the creation of `build-2026-11-06-001` at 07:29:16Z, the first build
containing the audit code. (An earlier revision of this document mislabelled them
as 02:07Z / 07:37 IST.) Both have actorType `admin`, the same
non-null actor ID, and notes identifying PR36 QA commit 5fb6fa9 and restoration.

The earlier brand test was independently verified by read-only query:
`brand.retired` recorded isActive true → false at `2026-11-04T16:48:30.582Z`, and
`brand.restored` false → true at `2026-11-04T16:49:15.466Z`, for the staging QA
brand and the same admin actor. The brand was restored. A phone-only customer
session was denied operations access; verified Google operator sign-in succeeded.

The first deployment was superseded by a readiness deployment without the audit
fixes. Two rejected recount attempts made no writes. The successful combined
deployment preserved that readiness source before adding the audit changes.
This is why future staging deployments must use the integrated release branch.

## Review corrections (not claimed as staging-tested)

The later PR review fixes lock brand/product rows before preimage reads and no-op
decisions, keeping writes and audits in the same transaction. Regression tests
force a competing writer to commit while the service waits, including stale no-op
and rollback cases. Target brand names are held stable through assignment.
Follow-up coverage forces audit insertion failures after all three brand mutations
and confirms rollback. Variant retirement/default guards now re-read after the
product lock; concurrent retire/default changes cannot leave a stale audit or
retire the newly selected default. Action tests check runtime booleans, non-admin
refusal, failure classification, and cache invalidation on unchanged retries.

Refund-request audits now record `availableToRequestPaise`, `requestedPaise`, and
`refundStatus: requested`; they do not assert that any money settled. Tests inspect
the audit before the gateway answers and then check pending, refused, and processed
outcomes. Only gateway processing marks the payment refunded.

These corrections are validated against disposable local/CI databases. The staging
evidence above establishes the original inventory and brand paths, not concurrency
or refund processing on a shared environment. No live refund was attempted.

## Release status

- PR #38 was merged into `release/rc-2026-10-19` on 6 November 2026 at 20:27Z
  (fast-forward to `f853f86`). Post-merge release CI passed at that head.
- Staging was redeployed from the clean canonical release head with
  `npm run deploy:staging`. Rollout `build-2026-11-06-004` (Cloud Build
  `2bec2c1a-d36c-4509-87a8-cb10497cda1d`) succeeded and serves 100% of traffic.
  Its uploaded source matches `git archive f853f86` file for file (only
  deploy-excluded files such as `.env.example` and `mobile-shell/` are absent).
  `build-2026-11-06-003` failed and was never served.
- Read-only smoke check on that build (7 November 2026): home page 200;
  `/api/serviceability/190001` and `/api/v1/serviceability/190001` return
  `codAllowed: false`; `/admin/inventory` redirects unauthenticated visitors.
- The review corrections in `7a78803`/`f853f86` are therefore deployed to staging,
  but were not re-exercised there through the console; their evidence remains the
  local and CI regression tests above.
- Production is unchanged: `ve-production` still serves `build-2026-11-02-002`.
  No production deployment is authorized by this document.

Future staging deployments must use `npm run deploy:staging` from a clean checkout
of the current canonical `release/rc-2026-10-19` head. The script refuses any other
branch, a dirty tree, or a head that differs from the canonical remote, and uploads a
git archive of the verified commit rather than the working directory.
