# Inventory ledger — release evidence and issue register

Branch `claude/inventory-ledger-audit` → PR
[#3](https://github.com/imareebkhan-design/vertical-express-new/pull/3) into
`release/integration-2026-10-09`. Last updated 17 Oct 2026.

**Status: NOT production-ready, and not proposed for production.** The code is
complete and gated locally and in CI. Staging migration, staging rollout and
every check that needs a signed-in operator or a device are pending, and each
needs the owner.

Legend: **Auto PASS** = automated test executed · **Visual PASS** = screenshot
taken · **Device PASS** = physical device · **Pending** = not yet run ·
**Blocked** = needs something outside this session.

## Issue register

| ID | Issue | Sev | Status | Root cause | Fix | Evidence | Commit | Env | Next action |
|---|---|---|---|---|---|---|---|---|---|
| INV-1 | Sales and cancels changed stock with no ledger row | P0 | Fixed | `placeOrder` decrement and `restock` wrote no `StockMovement` (ISS-090 remaining gap) | `sold` / `released` movements in the same transaction; additive enum migration | `stock-ledger-completeness` 7 tests, 5 fail without the fix | `70c76ab` | Local, CI | Staging checklist §4–5 |
| INV-2 | No way to detect a count that disagrees with its ledger | P0 | Fixed | No reconciliation reader | `findLedgerDrift` (read-only) + drift panel | drift test | `70c76ab` | Local, CI | Staging §6–7 |
| INV-3 | Legacy order with no warehouse restocked an arbitrary warehouse | P1 | Fixed | `restock` fell back to `findFirst` on variant only (ISS-004 territory) | No guess: no count change, no movement, alert `restock_needs_location` | legacy test fails on old code | `97f936d` | Local, CI | Staging §8 |
| INV-4 | Missing inventory row on cancel was silent | P1 | Fixed | `restock` skipped with a log line | Alert `restock_no_inventory_row`; never creates a row | missing-row test | `97f936d` | Local, CI | Staging §8 |
| INV-5 | An unresolved restock left no durable trace | P1 | Fixed | Only a log alert; the order is cancelled and cannot be cancelled again, so nothing retries | `inventory.restock_unresolved` audit row in the cancel's transaction; listed on `/admin/stock-ledger` | both edge tests assert it (fail without the fix); normal cancel writes none | `87d4b5d` | Local, CI | Staging §8 |
| INV-6 | A recount was a delta against a possibly stale on-screen figure | P1 | Fixed | Adjuster took a delta for every reason; `adjustStock` guards only its own read→write | `recountStock` takes counted qty + the figure shown, refuses if it moved; matching count writes a 0 movement | `stock-recount` 6 (race test fails without the guard); component 5 | `1b7ced4` | Local, CI | Staging §3, §4.3a |
| MIG-1 | My migration shared a timestamp with integration's `20261016120000_address_pin_pincode` | P1 | Fixed | Both were dated the same minute | Renamed to `20261017090000_…` before any shared database had applied it | 36-migration chain from empty; staging status | `bf06fc5` | Local, Staging | — |
| TEST-1 | 16 tests failed on a locally built test DB | P2 | Fixed | `setup-test-db.sh` skipped the seed-approval step CI runs | Same guarded, idempotent step added; no assertion changed | 1254/1254 on a rebuilt DB | `5991154` | Local | — |
| DOC-1 | Audit said migrations run on deploy | P1 | Fixed | Wrong; App Hosting never migrates | Corrected; migrate-before-rollout ordering in checklist | — | `da4c167` | — | — |
| OPS-1 | Vercel check fails on every commit | P3 | Open | Vercel says "Account is blocked"; same on the integration branch; Vercel is no longer the deploy target | — | commit statuses on `03db1b9`, `7b47e7d`, `da4c167` | — | — | Owner: disconnect the Vercel Git integration, or restore the account |
| INV-7 | Unresolved restocks have no "settled" state | P2 | Open | Settlement workflow unspecified | — (deliberately not invented) | — | — | — | Owner: decide how a settled row is marked |
| INV-8 | Pre-ledger stock has no opening balance | P1 | Open — needs approval | Stock seeded/imported before the ledger | Path exists without a backfill: a recount with the shelf number writes a 0 movement | `stock-recount` test 1 | `1b7ced4` | — | Owner: approve recounting stocked SKUs (or an opening-balance script) |
| INV-9 | No DB `CHECK (qty_on_hand >= 0)` | P2 | Open | App guards only | — | — | — | — | Needs a staging data check first |
| INV-10 | Low-stock uses a hardcoded 10, ignoring `lowStockThreshold`; "low" filter includes out-of-stock | P2 | Open | `admin/stock.ts` | — | — | — | — | Small fix; not in this PR |

Lifecycle reviewed (code, not staging): placement decrements in the order
transaction (no separate reservation; `qtyReserved` is unused by design,
`InventoryReservation` deferred) · picking, dispatch and delivery move no stock
(already taken at sale) · order cancel, shipment cancel and expiry cron release
only goods still in the warehouse, once, serialised by the order-row
compare-and-set (ISS-090) · `payment.failed` leaves the order pending so the
customer can retry; the stock returns through expiry · duplicate cancels are
refused · returns and refunds do not restock (policy owner-blocked) ·
negative stock is prevented by guarded updates.

## Verification matrix — release candidate

| Check | Result | Evidence |
|---|---|---|
| Backend suite, `bf06fc5` | Auto PASS 1270/1270 | local, isolated test DB (36 migrations from empty) |
| UI component tests, `bf06fc5` | Auto PASS 174/174 | local |
| Typecheck, lint, `bf06fc5` | Auto PASS | local |
| Production build, `bf06fc5` | Auto PASS (59/59 static; stock pages dynamic) | local, CI's placeholder env |
| CI on `da4c167` | Auto PASS | [push](https://github.com/imareebkhan-design/vertical-express-new/actions/runs/38980901497), [PR](https://github.com/imareebkhan-design/vertical-express-new/actions/runs/38980919098) |
| CI on `bf06fc5` | Auto PASS | [push](https://github.com/imareebkhan-design/vertical-express-new/actions/runs/38986259830), [PR](https://github.com/imareebkhan-design/vertical-express-new/actions/runs/38986263911) |
| Migration chain on an empty DB | Auto PASS | `setup-test-db.sh --reset` |
| Migration on staging | **PASS**, 17 Oct 12:40 IST, owner-approved, after the owner's backup; verified read-only | checklist §0 |
| `/admin/stock-ledger`, `/admin/inventory` rendered | **Pending** — needs an allow-listed Firebase sign-in | checklist §2 |
| Sale, cancel, recount, drift on staging | **Pending** | checklist §3–8 |
| Mobile, live tracking, payments end-to-end | **Not in this PR's scope**; not re-verified here | — |

## Owner actions

1. ~~Staging migration~~ done 17 Oct (checklist §0).
2. Roll the branch out to `ve-staging` **after** the migration, then run checklist §2–8 signed in as an operator.
3. Decide INV-7 (how a settled unresolved-restock is marked) and INV-8 (opening balances via recount).
4. Vercel: disconnect or restore (OPS-1).
5. Merge PR #3 only after the staging checklist passes. Production stays a separate decision.
