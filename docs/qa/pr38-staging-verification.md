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

Stored audit timestamps are respectively `2026-11-06T02:07:00.550Z` and
`2026-11-06T02:07:20.963Z` (07:37 IST). Both have actorType `admin`, the same
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

Refund-request audits now record `availableToRequestPaise`, `requestedPaise`, and
`refundStatus: requested`; they do not assert that any money settled. Tests inspect
the audit before the gateway answers and then check pending, refused, and processed
outcomes. Only gateway processing marks the payment refunded.

These corrections are validated against disposable local/CI databases. The staging
evidence above establishes the original inventory and brand paths, not concurrency
or refund processing on a shared environment. No live refund was attempted.

## Release hold

No merge or production deployment is authorized. Final-head CI and final review
must pass, followed by explicit owner approval. After integration, use
`npm run deploy:staging` from the clean current origin release branch. This change
prepares the guard; it does not perform a deployment or enable automatic rollout.
