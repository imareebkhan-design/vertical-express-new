# Catalogue safety gate — isolated handoff

Branch: `codex/catalogue-safety`. Baseline: `ff9a24b`. Claude Code is the sole release integrator. No push, staging/production deployment, combined release integration or business approval backfill was performed.

## Scope and behavior

Public readers share explicit product identity/image approval checks, active taxonomy and reviewed commercial eligibility for published offers. Catalogue-only records never expose a purchasable variant. Search, category counts, room shelves, wishlist, recommendations and sitemap follow the central policy. Approval-sensitive pages/services read fresh data.

Publication validates unit/pack, delivery class, explicit HSN/GST mapping, active SKU set, default variant, prices/MRP and warehouse inventory. Database triggers revoke review after identity, image or offer edits, including active SKU insertion/deletion. Cart filters ineligible lines; checkout rechecks after gateway setup, rejects a changed quoted base price, and holds shared locks through the order transaction. Ordinary inventory movement preserves approvals.

The owner confirmed that the existing verified staging admin is the final approval actor. No second approver is required. Product approvals still require actual recorded evidence; this handoff grants none. The old 263-row slug-only activation file is intentionally rejected until reviewed image hashes are supplied.

## Migrations and application state

All four migrations were applied successfully only to the isolated local `vertical_express_catalogue_safety` test database (29 total migrations). Staging and production were not migrated by this work.

- `20261008170000_catalogue_explicit_approval`
- `20261008171000_catalogue_commercial_review`
- `20261009100000_catalogue_commercial_invalidation`
- `20261009110000_catalogue_variant_set_review`

Existing products/images remain unapproved unless evidence was already recorded. Do not weaken the gate to retain product counts. Rollback must preserve additive schema and strict visibility; use a reviewed corrective change rather than reverting to status-only readers.

## Verification

Final backend results (9 Oct, full `lib/**/*.test.ts` against the isolated test DB): **1031 passed, 0 failed, 0 skipped**. The last four failures were test fixtures, fixed without weakening the gate: `variant-pricing` now records the owner re-review after its price edits (offer changes revoke approval by design); `v1-wallet-wishlist` gives its published fixture an explicit zero-stock record; the forged-cart test accepts refusal at the public lookup as well as at the sale check; earlier fixture work added `approveTestProductsCreatedSince` and the CI seed-approval step for synthetic data only. Earlier focused catalogue run: 24 passed, 0 failed, 0 skipped. Component tests: 113 passed, 0 failed, 0 skipped. Typecheck, lint, design-system and asset checks passed. Diff review found no credential patterns.

Local build limitations: the standard Turbopack build rejects the externally symlinked node_modules in this checkout. A standard Next webpack build also fails resolving crypto from instrumentation and reports unavailable optional Capacitor packages. Those failures are outside the catalogue diff; this handoff does not claim a verified release build. Claude must verify the release build in its integration environment. No release configuration was changed to bypass either failure.

## Remaining rollout work (Claude)

- Integrate this isolated commit and verify the combined release/build.
- Coordinate the additive migrations with the strict gate. Existing rows without approval will be hidden.
- Record genuine owner identity, image and commercial approvals using the existing verified admin and reviewed evidence. Do not synthesize approvals or run test helpers on staging/production.
- No remaining owner decision blocks the local gate implementation.

## Files modified

- `.github/workflows/ci.yml`
- `actions/products.ts`
- `app/(shop)/categories/page.tsx`
- `app/(shop)/category/[slug]/page.tsx`
- `app/(shop)/product/[slug]/page.tsx`
- `app/page.tsx`
- `app/sitemap.ts`
- `components/auth/__tests__/catalogue-category-policy.test.tsx`
- `components/mobile/categories/mobile-categories-view.tsx`
- `docs/CATALOGUE_SAFETY_HANDOFF.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/KNOWN_ISSUES.md`
- `lib/__tests__/category-counts.test.ts`
- `lib/__tests__/not-found-routes.test.ts`
- `lib/catalog-only-batch.ts`
- `lib/catalog-policy.ts`
- `lib/services/__tests__/bought-with.test.ts`
- `lib/services/__tests__/cart-api.test.ts`
- `lib/services/__tests__/cart-inventory.test.ts`
- `lib/services/__tests__/cart-merge.test.ts`
- `lib/services/__tests__/catalog-only.test.ts`
- `lib/services/__tests__/catalogue-approval-policy.test.ts`
- `lib/services/__tests__/checkout-concurrent-idempotency.test.ts`
- `lib/services/__tests__/checkout-total-guard.test.ts`
- `lib/services/__tests__/checkout-transaction.test.ts`
- `lib/services/__tests__/commercial-approval-invalidation.test.ts`
- `lib/services/__tests__/coupon-checkout.test.ts`
- `lib/services/__tests__/coupon-e6.test.ts`
- `lib/services/__tests__/express-checkout.test.ts`
- `lib/services/__tests__/express-delivery.test.ts`
- `lib/services/__tests__/search-identity.test.ts`
- `lib/services/__tests__/search.test.ts`
- `lib/services/__tests__/shipments-checkout.test.ts`
- `lib/services/__tests__/v1-account-location.test.ts`
- `lib/services/__tests__/v1-coupon.test.ts`
- `lib/services/__tests__/v1-journey.test.ts`
- `lib/services/__tests__/v1-search-entry.test.ts`
- `lib/services/__tests__/v1-total-guard.test.ts`
- `lib/services/__tests__/v1-wallet-wishlist.test.ts`
- `lib/services/admin/__tests__/catalog-only-activation.test.ts`
- `lib/services/admin/__tests__/catalogue-range-import.test.ts`
- `lib/services/admin/__tests__/sellable-gate.test.ts`
- `lib/services/admin/__tests__/variant-pricing.test.ts`
- `lib/services/admin/catalog-only-activation.ts`
- `lib/services/admin/commercial-readiness.ts`
- `lib/services/admin/publish-guard.ts`
- `lib/services/cart.ts`
- `lib/services/catalog.ts`
- `lib/services/checkout-catalogue.ts`
- `lib/services/checkout.ts`
- `lib/services/search.ts`
- `lib/services/wishlist.ts`
- `prisma/migrations/20261008170000_catalogue_explicit_approval/migration.sql`
- `prisma/migrations/20261008171000_catalogue_commercial_review/migration.sql`
- `prisma/migrations/20261009100000_catalogue_commercial_invalidation/migration.sql`
- `prisma/migrations/20261009110000_catalogue_variant_set_review/migration.sql`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `scripts/activate-catalog-only.mts`
- `system_architecture.md`
- `test-support/approve-seed-catalogue.mts`
- `test-support/catalogue-fixtures.ts`
- `test-support/ui-setup.ts`
