# Inventory ledger — staging verification checklist

Branch `claude/inventory-ledger-audit`. Staging only (`ve-staging`). **Nothing here
touches production, and nothing here is approval to deploy it.**

Work only on the clearly fictional demo catalogue staging is seeded with. Pick
**one QA SKU** for the whole run and write it down; every step below uses it.
Do not adjust any other SKU's stock.

## 0. Before deploying — staging migration (needs owner approval)

Every command below touches the staging database and needs the guard override
`VE_ALLOW_REMOTE_DB=1`, **status included**. The guard and
`scripts/staging-db.sh` refuse the production project by ref. Staging ref, as
printed by the script: `gjhxhmcsuhxcmrvtkggz`.

The migration must be run from a checkout that **contains it**. `.env.staging`
lives only in `~/ve-integration-app`, which does not have it until this branch is
merged. Pick one:

- **A (preferred: staging before merge).** The owner makes the staging env
  visible to this worktree. It is gitignored, and the owner chooses to do this:
  `ln -s ~/ve-integration-app/.env.staging ~/ve-inventory-audit/.env.staging`
- **B.** Merge first, then run from `~/ve-integration-app`.

| # | Step | Expected | Result |
|---|---|---|---|
| 0.1 | Take a staging database backup (Supabase dashboard → Database → Backups) | Backup listed with today's time | |
| 0.2 | `cd ~/ve-inventory-audit && VE_ALLOW_REMOTE_DB=1 VE_EXPECTED_DB_REF=gjhxhmcsuhxcmrvtkggz scripts/staging-db.sh status` | Pending, in this order: `20261016120000_address_pin_pincode` (integration's, not yet on staging as of 16 Oct) and `20261017090000_stock_movement_released`. **Anything else pending → stop**: staging is behind for other reasons and that needs its own review | |
| 0.3 | Same command with `migrate` instead of `status` | "All migrations have been successfully applied"; status up to date | |
| 0.4 | Read-only SQL (Supabase SQL editor): `SELECT unnest(enum_range(NULL::"StockMovementReason"));` | Includes `released` | |
| 0.5 | Remove the 0-A symlink if one was made | — | |

Recovery: the enum value is additive and cannot be dropped cheaply. If the code
rollout is abandoned, leave the value in place; older code ignores it. Restore
from the 0.1 backup only if something else in the migration run went wrong.
Rehearsed locally on 17 Oct: the full chain applied to an empty database
(`scripts/setup-test-db.sh --reset`), and 1256 tests passed on it.

**Order matters: migrate (0.3) before the code rollout (1.1).** Both pending migrations must be in place first: Prisma reads every `addresses` column, so without `pin_pincode` every address read fails. The new code
writes `released` on every cancel. Against a database without that enum value,
the insert fails, the cancel transaction rolls back, and **every cancel on
staging fails**, including the expiry cron. The reverse is safe: the old code on
a migrated database never uses `released`. The build does not migrate (App
Hosting runs `npm run build`; see `docs/DEPLOY_FIREBASE.md` §Migrations).

## 1. Deploy

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Roll out the branch build to `ve-staging` | Rollout succeeds; home page and `/admin` load | |
| 1.2 | Record the build id | — | |

## 2. `/admin/stock-ledger` — first look

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Open `/admin/stock-ledger` signed in as an allow-listed operator; screenshot at 1440 and 393 px | Banner says sales and cancellations are recorded and gives the "no history yet" count. No horizontal scroll at 393 | |
| 2.2 | Note the "no history yet" count (N₀) and whether a "counts disagree" panel shows (D₀) | Stock seeded before the ledger is counted in N₀. Any D₀ rows are pre-existing and must be explained before go-live, not ignored | |

## 3. Give the QA SKU a known starting point

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | `/admin/inventory` → QA SKU → Adjust → **Recount**, enter the number actually counted on the shelf, e.g. 20, note "staging ledger QA" | The form shows `current → 20 (±diff)`. Ledger top row: Recount, that diff, On hand 20, your email | |
| 3.2 | Reload the ledger | N₀ drops by one if the SKU had no history; the QA SKU is not in the drift panel | |

## 4. Sale

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | As a test customer, buy 3 of the QA SKU by COD at a serviceable staging pincode | Order placed | |
| 4.2 | Ledger | New top row: **Sold**, −3, On hand 17, "system", note = the order number | |
| 4.3 | `/admin/inventory` for the QA SKU | On hand 17, matching 4.2 | |
| 4.3a | Open the recount form, then place another order for 1 before pressing Apply; enter the count and Apply | Refused: "Stock changed while you were counting — it now says …"; nothing is written | |
| 4.4 | Submit the same checkout twice (double-tap Pay, or a retry after a dropped response) | One order, one Sold row | |

## 5. Cancellation

| # | Step | Expected | Result |
|---|---|---|---|
| 5.1 | Cancel the 4.1 order before dispatch (customer cancel or admin cancel) | Order cancelled | |
| 5.2 | Ledger | New top row: **Released**, +3, On hand 20, "system", note "Order cancelled" | |
| 5.3 | Sum the QA SKU's rows for that order number | Sold −3 + Released +3 = 0 | |
| 5.4 | Place another 2-unit order, cancel **its shipment** from the dispatch board, then cancel the order | Exactly one Released +2 ("Shipment cancelled"); cancelling the order adds no second Released row | |
| 5.5 | Leave a pending online-payment order to expire (expiry cron) | One Released row for it, if it had decremented stock | |

## 6. Reconciliation

| # | Step | Expected | Result |
|---|---|---|---|
| 6.1 | Read-only SQL, QA SKU only: newest movement's `qty_after` vs `inventory.qty_on_hand` | Equal | |
| 6.2 | Read-only SQL, all rows: `SELECT count(*) FROM inventory i JOIN LATERAL (SELECT qty_after FROM stock_movements m WHERE m.variant_id=i.variant_id AND m.warehouse_id=i.warehouse_id ORDER BY created_at DESC, id DESC LIMIT 1) l ON true WHERE l.qty_after <> i.qty_on_hand;` | Equals the page's "counts disagree" number | |
| 6.3 | Recount the QA SKU entering the number it already shows | Accepted; a Recount row with change 0 is written ("counted, agreed"); the count is unchanged. If the SKU had no history, the "no history yet" count drops by one | |

## 7. Drift reporting (optional; needs explicit approval for a direct edit)

Drift can only be produced by changing a count outside the app. **Do this only if
the owner approves a direct database edit, on staging, on the QA SKU only.**

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | `UPDATE inventory SET qty_on_hand = qty_on_hand + 1 WHERE variant_id = '<QA variant>' AND warehouse_id = '<QA warehouse>';` | — | |
| 7.2 | Reload the ledger | "1 count disagrees" (D₀ + 1); row shows On hand = ledger + 1, Gap +1 | |
| 7.3 | Recount the QA SKU with its true shelf number (one less than shown), with a note naming the 7.1 edit | A Recount row with −1; the drift row disappears; the count returns to D₀ | |

## 8. Log and alert checks

| # | Step | Expected | Result |
|---|---|---|---|
| 8.1 | Search the staging logs for `restock_needs_location` and `restock_no_inventory_row`, and look at the ledger page's **Cancelled goods not put back** panel | No log hits and no panel during this run. Any hit names an order whose goods were **not** restocked; settle it with a Received or Recount at the warehouse where the goods are, with the order number in the note. The panel row stays as history | |

## Sign-off

All rows pass; screenshots attached; D₀ explained; build id recorded. Then, and
only then, production can be **proposed**. That still needs the owner's
approval, a production backup, and the same migrate-before-rollout order.
Opening balances for the N₀ rows are a separate decision the owner must approve.
