# Launch readiness evidence — 5 Nov 2026

## Candidate and release boundary

Branch: codex/launch-readiness, based on RC 3c66e59. Existing PR #27 browsing fixes were integrated locally in 78597cd. No merge to main or release branch, no application deployment, and no changes to Claude’s admin-audit worktree. PR #24 remains held.

## Completed changes

Mobile browsing preserves URL filters during pagination, rejects stale requests and offers retry. Catalogue PDP sticky action reaches enquiry. Empty categories reuse PR #27 onward navigation. Enquiry submissions recover from exceptions without losing fields; admin inbox has status filtering, stable pagination and complete messages. Owner is the inbox operator. COD is disabled at serviceability and checkout surfaces by owner instruction.

## Infrastructure actions and evidence

- Protected public-schema production dump restored to local ve_readiness_restore_20261104. All 49 table counts and canonical row hashes matched when sessions used UTC. No restore or schema migration was applied to production.
- Production cod.enabled set false with a system audit entry citing owner instruction. No pincode rows changed; 25 Srinagar records preserved. Deployment COD_DISABLED override is still candidate code/config.
- Created ve-production-product-images, object versioning enabled. Copied 260 approved public image objects. Source and destination each matched all 260 expected SHA-256 values. No unapproved assets copied.
- Production image database URLs were NOT changed. A local rehearsal showed the existing URL-change trigger revokes approvals; a guarded rerun rolled back and retained all 260 approvals. URL cutover remains blocked pending an approval-preserving design. Do not run the script expecting success against the current schema.
- Shared staging/production runtime service identity remains an IAM isolation limitation. A separate bucket is not full identity isolation.
- Created uptime checks for homepage and /api/health, owner email notification channel, two uptime alert policies and a production Cloud Run error alert. Latest observed metrics for both checks are passing. Owner receipt of a notification has not been tested.

## Browser verification

Built candidate on localhost:3104 against local restore: category index, coming-soon onward navigation, Power Tools listing, product detail and enquiry submission. Enquiry ENQ-20261104-C338206B was confirmed in the local admin queue with status new. No production enquiry was submitted. Signed-in owner admin workflow on staging remains unverified.

## Quality gates

- First full backend run: 1,437 passed; zero failed/cancelled/skipped.
- Final isolated backend run: pending at checkpoint; database ve_readiness_test_20261104, zero competing connections before start.
- UI suite: 213 passed; zero failed/cancelled/skipped.
- Typecheck, lint and final production build passed. Existing optional Capacitor plugin module warnings remain.
- Guarded image relocation rehearsal: correctly aborts/rolls back when trigger invalidates approval; 260 original approved images retained.

## Unclosed release gates

1. Approval-preserving image cutover and independent production runtime IAM.
2. Signed-in owner admin acceptance on staging; Claude’s separate role/audit slice must be integrated and verified.
3. Confirmed legal entity, public contact, delivery/returns policies, launch SKU prices/MRP and physical stock. No such values fabricated.
4. LIVE payment/refund acceptance and fulfilment/live tracking acceptance before transactional mode.
5. Alert receipt verification, release approval, deployment from exact tested commit and post-deploy smoke checks.

No production-ready or ready-to-take-paid-orders claim is made.

## Rollback and integration instructions

- Application changes are isolated on the candidate branch; integrate through review with Claude. Do not merge PR #24 or deploy based on this document alone.
- Existing production image URLs and the source bucket remain intact. New bucket copies can remain safely while the cutover blocker is resolved. The current-schema guarded script fails closed in one transaction.
- Keep COD disabled on rollback: that is an explicit owner business decision, not a temporary test switch. Historic pincode values were not rewritten.
- Keep credentials, backup dumps and customer-data evidence private; only these non-sensitive summaries belong in git.
- Claude admin-audit worktree is active, with committed d051106 and additional uncommitted fixes at the last read-only inspection. No attempt was made to integrate it here.
- The final test database and restored production copy are distinct. Building and browser testing use the restored copy, not the backend suite database.
