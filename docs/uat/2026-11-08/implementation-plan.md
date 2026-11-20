# Client acceptance preparation — implementation plan

Scope: isolated UAT, Razorpay TEST only. Production remains catalogue-only. Owner
authorizes selling at verified MRP and 50 opening test units per active SKU; this
does not authorize inventing MRP, publication approvals, or production inventory.

## Changes

- NEW `lib/services/admin/uat-inventory.ts`: one-time opening recount to 50 at an
  explicitly selected active warehouse, using a fixed per-SKU audit marker and a
  database transaction/advisory lock. Skip already initialized SKUs on reruns,
  including after orders consume stock. Refuse reservations and negative states.
- NEW `scripts/prepare-client-uat.mts`: dry-run-first CLI using the existing staging
  database guard, mandatory consistent test payment configuration and explicit
  warehouse. Inventory only; report missing MRP and never infer verified evidence.
- NEW `lib/services/admin/__tests__/uat-inventory.test.ts`: database regressions for
  repeat runs, consumed stock, reserved stock and transaction rollback.
- MODIFY `app/layout.tsx`; NEW `components/uat-notice.tsx`: staging-only notice of
  simulated payments, stock/delivery data, and DRAFT proposed no-voluntary-returns
  policy, preserving remedies and test cancellation/refund workflows.
- NEW `docs/uat/2026-11-08/client-guide.md` (C), `configuration-map.md` (D),
  `readiness-report.md`: explicit evidence/status for all requested journeys,
  operator steps, pricing provenance gaps, business decisions and release gates.

## Reuse and validation

Reuse catalogue-update previews/audits, commercial approval/publish guards, stock
ledger, checkout/payment/refund services, existing Google/phone auth and admin RBAC.
Use disposable local Postgres for automated writes; staging inspection is read-only
until reviewed setup is approved. No new migration, no real notification, no live
payment/refund, no production write. Run focused inventory tests, typecheck, lint,
UI tests and relevant existing payment/order regressions. Manual browser checks
are recorded separately from automated coverage; no fabricated PASS.

## Release gates

Push the reviewable branch and PR. Do not deploy unreviewed changes or bypass the
canonical release-source guard. After review/integration, deploy staging via
`npm run deploy:staging`, dry-run then apply the guarded opening stock, and run
client walkthroughs. Real SKU pricing remains blocked wherever reliable MRP
provenance or pack/identity/tax approvals are missing. Client testing readiness
and commercial production readiness are separate conclusions.
