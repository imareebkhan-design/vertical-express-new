# Verified image delivery handoff — 6 Nov 2026

## Outcome

The candidate serves the existing approved images from version-pinned production copies without changing their identity records. This replaces the proposed database URL rewrite, which correctly invalidates approvals. No approval trigger was weakened, no approvals were backfilled, and no schema migration is required.

## Design

- lib/catalog/production-image-delivery.json records 260 exact image IDs, original URLs, recorded SHA-256 values and destination URLs pinned to GCS object generations. This is delivery evidence, not an owner approval ledger.
- lib/catalog/image-delivery.ts applies mappings only for VE_DEPLOY_ENV=production and PRODUCTION_IMAGE_DELIVERY=1, and only when all three identity fields match. Unmapped or changed identities keep their original URL; they never inherit another image's mapping. Existing approval queries still determine visibility.
- Catalogue cards (including wishlist and related items), PDP galleries, search suggestions and cart serialization use the resolver. New orders snapshot the cart's resolved image; historical order snapshots are untouched.
- Production configuration enables this mapping and permits generation queries only under the explicit production bucket path. Staging is unchanged. The source bucket remains permitted for rollback and provenance/admin views.
- No database writes are needed. The old apply-image-rehome.mts URL-rewrite route is NOT the deployment path; it still fails closed if approval is revoked.

## Verified evidence

- Fresh pinned object verification: 260/260 SHA-256 matches.
- Local production restore rehearsal: 260 visible products, 260 card/PDP checks, 260 rollback checks, 6 search suggestion checks.
- All 324 image rows, including every approval field, unchanged after rehearsal; zero database writes.
- Affected regression suite: 42 passed, 0 failed/cancelled/skipped. Includes approval invalidation, catalogue visibility, search identity, cart inventory, mapping and configuration tests.
- Typecheck, lint and production-mode build passed. Existing optional Capacitor plugin warnings remain.
- Built site browser check: PDP image loaded through Next image optimisation from ve-production-product-images with its pinned generation. Local screenshot is kept outside git.
- Earlier full suite (previous commit): 1,443 backend and 213 UI passed. That full suite was not rerun for this focused slice.

## Claude integration and rollback

1. Review this isolated candidate together with preceding readiness commits. Do not merge the held release PR automatically.
2. Before rollout, verify a fresh production snapshot with scripts/verify-image-delivery.mts on a separate local restore. It refuses remote databases. Any new approved source image missing from the manifest must be copied, pinned and hash-verified first. Current coverage is 260 images, not an assertion about future imports.
3. Preserve the pinned object generations. Do not purge them or add a lifecycle policy that removes them while referenced.
4. Integrate and verify on a production-configured non-live candidate before the separately approved production rollout. Ordinary staging deliberately does not activate the production mapping.
5. Roll back by setting PRODUCTION_IMAGE_DELIVERY=0 for BUILD and RUNTIME and rebuilding/redeploying the prior verified candidate. Rebuild covers prerendered pages too. Original URLs and the source bucket remain available; no data rollback or reapproval is required.

No application deployment was performed in this slice. Production still runs its previous build. Shared staging/production runtime IAM remains a separate isolation limitation. Paid-order and business acceptance gates remain unchanged.
