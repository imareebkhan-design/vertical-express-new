# QA catalogue stock rerun guard

PR #46 checks whether inventory exists at the requested warehouse, but does not
consult the per-SKU opening marker. A rerun at another warehouse can therefore
allocate another 50 units per SKU. This violates the approved one-time UAT setup.

- MODIFY `lib/services/admin/qa-catalogue.ts`: require a transaction; serialize
  with the existing UAT initializer lock; skip stock creation if any opening
  marker or existing inventory row exists for the SKU, regardless of warehouse.
- MODIFY `lib/services/admin/__tests__/qa-catalogue.test.ts`: reproduce a second
  warehouse run and a missing inventory row with surviving opening audit marker.
- MODIFY `docs/KNOWN_ISSUES.md`: record the defect and fix scope.

Run regressions before and after the fix on disposable local Postgres, then
typecheck and lint. No staging or production writes. Submit as a follow-up to
PR #46 for review; do not merge or deploy unreviewed code.

## Verification and handoff

- Both new tests failed against the original implementation: four SKUs gained
  stock at a second warehouse, and a missing row was replenished despite its marker.
- After the fix: 19/19 QA catalogue, QA fixture and UAT inventory tests passed on
  disposable local Postgres. `npx tsc --noEmit`, `npm run lint` and
  `git diff --check` passed.
- No schema or deployed configuration changed. No remote inventory was written.
- PR #46 run `42452164535` passed all 1,483 backend tests but failed its build in
  `next/font/google` / Turbopack resolution for Plus Jakarta Sans. This is a
  separate build gate; the stock tests do not resolve it.
- Browser control was unavailable during this continuation. The provider-contact
  blocker, TEST success/failure/refund evidence and native runtime verification
  remain outstanding, as documented in PR #47.

Implementation pattern: all one-time UAT opening stock writers must use the
per-variant audit marker across warehouses and serialize with advisory lock
746502608. Inventory-row existence alone is not an idempotency guarantee.
