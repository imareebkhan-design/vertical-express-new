# Inventory ledger — staging verification checklist

Branch `claude/inventory-ledger-audit`. Staging only (`ve-staging`). **Nothing here
touches production, and nothing here is approval to deploy it.**

Work only on the clearly fictional demo catalogue staging is seeded with. Pick
**one QA SKU** for the whole run and write it down; every step below uses it.
Do not adjust any other SKU's stock.

## 0. Before deploying

| # | Step | Expected | Result |
|---|---|---|---|
| 0.1 | Take a staging database backup (Supabase dashboard → Database → Backups) | Backup listed with today's time | |
| 0.2 | `scripts/staging-db.sh status` with the remote guard set for staging: `VE_ALLOW_REMOTE_DB=1 VE_EXPECTED_DB_REF=<staging ref> scripts/staging-db.sh status` | Exactly one pending: `20261016120000_stock_movement_released` | |
| 0.3 | Same command with `migrate` | "All migrations have been successfully applied", status up to date | |
| 0.4 | Read-only SQL: `SELECT unnest(enum_range(NULL::"StockMovementReason"));` | Includes `released` | |

**Order matters: migrate (0.3) before the code rollout (1.1).** The new code
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
| 3.1 | `/admin/inventory` → QA SKU → **Recount** with the change that brings it to a round number, e.g. +(20 − current), note "staging ledger QA". The form takes a change, not the counted number | Ledger top row: Recount, that delta, On hand 20, your email | |
| 3.2 | Reload the ledger | N₀ drops by one if the SKU had no history; the QA SKU is not in the drift panel | |

## 4. Sale

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | As a test customer, buy 3 of the QA SKU by COD at a serviceable staging pincode | Order placed | |
| 4.2 | Ledger | New top row: **Sold**, −3, On hand 17, "system", note = the order number | |
| 4.3 | `/admin/inventory` for the QA SKU | On hand 17, matching 4.2 | |
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
| 6.3 | Submit a recount with a change of 0 | Refused; nothing written; the count is untouched | |

## 7. Drift reporting (optional; needs explicit approval for a direct edit)

Drift can only be produced by changing a count outside the app. **Do this only if
the owner approves a direct database edit, on staging, on the QA SKU only.**

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | `UPDATE inventory SET qty_on_hand = qty_on_hand + 1 WHERE variant_id = '<QA variant>' AND warehouse_id = '<QA warehouse>';` | — | |
| 7.2 | Reload the ledger | "1 count disagrees" (D₀ + 1); row shows On hand = ledger + 1, Gap +1 | |
| 7.3 | From `/admin/inventory`, recount the QA SKU with a change of −1 and a note saying it reverses the 7.1 edit | A Recount row with −1; On hand is back to the ledger's number; the drift row disappears and the count returns to D₀ | |

## 8. Log and alert checks

| # | Step | Expected | Result |
|---|---|---|---|
| 8.1 | Search the staging logs for `restock_needs_location` and `restock_no_inventory_row`, and look at the ledger page's **Cancelled goods not put back** panel | No log hits and no panel during this run. Any hit names an order whose goods were **not** restocked; settle it with a Received or Recount at the warehouse where the goods are, with the order number in the note. The panel row stays as history | |

## Sign-off

All rows pass; screenshots attached; D₀ explained; build id recorded. Then, and
only then, production can be **proposed**. That still needs the owner's
approval, a production backup, and the same migrate-before-rollout order.
Opening balances for the N₀ rows are a separate decision the owner must approve.
