# Launch readiness — 4 November 2026

Owner authorised the five-priority plan and remaining ordering engineering.
Worktree: `codex/launch-readiness`, based on RC `3c66e59`. No edits to Claude worktrees.
The application has no AGENTS.md; CLAUDE.md is the available operating manual.

## Priority 1: browsing
- Reuse PR #27 on this isolated candidate; do not merge the release PR or deploy prematurely.
- [MODIFY] components/mobile/product/mobile-product-view.tsx: make the catalogue-only sticky action reach the enquiry form.
- [NEW] focused mobile PDP regression test.
- [MODIFY] components/shop/__tests__/cart-provider.test.tsx only if the reported hanging tests are a harness defect; preserve account-isolation checks.

## Priority 2: enquiries
- [MODIFY] components/shop/product-enquiry-form.tsx: handle network/action exceptions without losing entered fields; explain enquiry data use and link privacy notice.
- [MODIFY] components/shop/__tests__/product-enquiry.test.tsx: retry and submission regression coverage.
- Inspect admin inbox capacity/status handling and privacy text before selecting further exact edits.
- Operational owner/channel pending user answer. No invented contact or response-time promise.

## Priorities 3–5: images, release/public information, monitoring/recovery
- Inspect existing image-rehome tooling and infrastructure before choosing changes; retain hash/approval identity, backup and rollback.
- Verify public information against recorded owner values; missing legal/commercial facts remain blockers.
- Inspect monitoring and backup setup. Perform isolated restore and final isolated backend tests before any deployment.
- Record exact follow-up file changes and evidence here as inspection resolves dependencies.

## Ordering
Preserve catalogue mode until verified SKU prices/MRP, physical stock, policies, live payment/refund and fulfilment checks pass. Claude's admin-audit worktree is separately owned; do not duplicate it.

## Verification
Typecheck, lint, affected UI tests, full UI suite, isolated local backend suite, browser journeys, and build. No claim of a live fix before deployment and post-deploy checks.

## Inspection-driven refinements — 5 Nov 2026

[MODIFY] Category page and mobile category view; [NEW] lib/category-query.ts plus parser and pagination tests: share URL filters, retain attributes, reject stale responses and enable retry.

[MODIFY] Admin enquiry page/service/status control and service tests: paginated full-message inbox with stable ordering and failure recovery. Owner confirmed inbox handling.

[MODIFY] serviceability, both checkout views and hosting overlays: enforce owner COD stop and default to online; add service regression.

[MODIFY] next.config.ts and production overlay; [NEW] image-cutover-config tests and guarded scripts/apply-image-rehome.mts: stage exact bucket allowlist compatibility. Rehearsal discovered database URL-change approval invalidation. The script now aborts the entire transaction; no live URL cutover is authorized by a successful copy alone. Do not disable the trigger or backfill approvals.

[MODIFY] privacy enquiry explanation and brand/SEO wording; retain unresolved legal/policy facts. [MODIFY] UI test setup to use DOM FormData.

[MODIFY] owner input and known issues documents; [NEW] launch-readiness evidence and architecture notes. No application deployment or release/main merge in this slice.

## Approved image relocation continuation — 6 Nov 2026

Owner approved proceeding one step at a time. Preserve database image identity and approval triggers; separate delivery through a reviewed immutable manifest instead of rewriting approved URLs.

- [NEW] lib/catalog/image-delivery.ts and production-image-delivery.json: exact id/source URL/hash mapping to hash-verified, generation-pinned production objects; explicit production-only activation and rollback flag.
- [MODIFY] catalog, search and cart serializers (wishlist reuses catalog serializer): use delivery resolver only after existing approval queries.
- [MODIFY] next.config.ts: allow exact generation-pinned destinations alongside existing explicit bucket patterns; production hosting flag activates mapping, staging unchanged.
- [NEW] focused resolver tests and scripts/verify-image-delivery.mts: verify complete current approved-row coverage, pinned object bytes, public surfaces and unchanged approval state on local restore.
- [MODIFY] evidence, architecture and task records. No schema migration, owner approval backfill, trigger change, deployment or edits to Claude worktrees.
