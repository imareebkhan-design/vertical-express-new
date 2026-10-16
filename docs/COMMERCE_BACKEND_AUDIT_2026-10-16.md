# Commerce backend audit — catalogue and inventory first

16 October 2026 · branch `claude/inventory-ledger-audit`, cut from
`origin/release/integration-2026-10-09` at `03db1b9`.

**Scope and confidence.** Catalogue and inventory were traced in the code this
session; everything marked *traced* below was read, and claims about it cite a
file. Payments, shipments, search and returns were not re-traced end to end —
they are summarised from the code layout, `CLAUDE.md` and `docs/KNOWN_ISSUES.md`
and marked *not re-traced*. No remote database (staging or production) was
queried, so **no live count is stated here, including the 979-draft catalogue
figure** — that needs a read-only count on staging by someone authorised to run
it.

**Integration line.** `release/integration-2026-10-09` is the live integration
branch (newest commits, and every catalogue branch — `codex/catalogue-safety`,
`catalog/catalog-only`, `release/2026-10-08-catalogue` — is already merged into
it). `main` is far behind it. The integrator's local copy at
`~/ve-integration-app` is one commit ahead of `origin` (`7b47e7d`, unpushed);
this branch is cut from `origin` so it does not depend on unpushed work.

---

## 1. Backend architecture map (catalogue and inventory)

| Concern | Models (`prisma/schema.prisma`) | Services | Admin UI | Tests |
|---|---|---|---|---|
| Taxonomy | `Category` (group, isBulk, sort), `Brand` (unique name and slug) | `lib/services/catalog.ts`, `actions/brands.ts` | `/admin/brands` | `brands.test.ts`, `nav-taxonomy.test.ts` |
| Product | `Product` — status `draft/published/…`, explicit identity approval, `commercialReview` JSON, express eligibility | `admin/product-create.ts` (`writeProduct`), `admin/publish-guard.ts`, `admin/commercial-readiness.ts`, `admin/catalogue-approval.ts` | `/admin/listing` (create), `/admin/products`, `/admin/products/[slug]`, `/admin/catalogue-approvals` | `product-create`, `sellable-gate`, `catalogue-approval-policy`, `commercial-approval-invalidation` |
| Variant / SKU | `ProductVariant` — `sku @unique`, free-form `attributes` JSON, `pricePaise`, `compareAtPaise`, `isDefault`, `isActive` | `admin/variant-pricing.ts` (`setVariantPrice`, bounds-checked) | product editor | `variant-pricing.test.ts`, `catalog-attrs.test.ts` |
| Quantity pricing | `BulkPriceTier (variantId, minQty) @unique` | `cart.ts` resolves on read | — | cart tests |
| Media | `ProductImage` — provenance (`sourceUrl`, `licence`, `sha256`), approval status and severity | `admin/product-image-import.ts`, `scripts/import-product-images.mts` | product editor, catalogue approvals | image tests |
| Catalogue import | — (no import-job table) | CSV: `lib/catalogue-csv.ts` + `admin/catalogue-import.ts` (preview → import, all-or-none, existing products skipped). Ranges: `admin/catalogue-range-import.ts` (plan → apply, keyed to an artifact SHA-256) | `/admin/listing` | `catalogue-import.test.ts` |
| Stock | `Warehouse`, `Inventory (variantId, warehouseId) @unique` with `qtyOnHand`, `qtyReserved`, `lowStockThreshold` | `admin/stock.ts` (read), `inventory-movements.ts` (`adjustStock`, ledger readers) | `/admin/inventory`, `/admin/stock-ledger` | `stock-adjust`, `cart-inventory`, `shipment-cancel-stock` |
| Stock ledger | `StockMovement` — signed delta, stored `qtyAfter`, reason enum, actor, `orderId` | `inventory-movements.ts` | `/admin/stock-ledger` | `stock-adjust`, **`stock-ledger-completeness` (new)** |
| Sale decrement | — | `checkout.ts` `placeOrder`: `updateMany … qtyOnHand gte qty` per line, warehouse resolved from the serviceable pincode, inside the order transaction | — | `checkout-transaction`, `checkout-concurrent-idempotency` |
| Release on cancel | — | `orders.ts` `releaseOrderInventory` / `releaseShipmentInventory` → `restock` | order / shipment screens | `shipment-cancel-stock`, `cancel-closes-shipments` |
| Cart availability | — | `cart.ts`: `available = qtyOnHand − qtyReserved` at the resolved warehouse | — | `cart-inventory` |

Data flow, stock: **cart** checks availability at the resolved warehouse →
**checkout** decrements in the order transaction (row lock held to commit) →
**cancel** (customer, admin, expiry cron, shipment cancel) restocks only goods
still in the warehouse, serialised by the order-row compare-and-set (ISS-090) →
**ledger** records each of these (as of this branch).

## 2. Shopify capability gap matrix

Status: EXISTS / PARTIAL / MISSING / N/A / NOT VERIFIED. "UX" = merchant
interface gap, "Correctness" = backend can produce wrong data.

| Capability | Status | Evidence | Gap kind | Priority | Complexity |
|---|---|---|---|---|---|
| Product draft → publish with validation | EXISTS | `publish-guard.ts` `sellableReasons`; explicit identity + commercial review | — | — | — |
| Product list: search, filter, sort | **MISSING** | `manage.ts:195` `adminListProducts` takes only `page`; no search, no status/brand/category filter, no completeness columns | UX | **P0** | S |
| Draft completeness view (price, image, stock, approval) | PARTIAL | readiness reasons exist per product (`commercial-readiness.ts`); not surfaced as list columns or filters | UX | P0 | S |
| Guided add-product | PARTIAL | `/admin/listing` creates one product with **one** variant (`NewProduct.variant` is singular) | UX | P1 | M |
| Multi-variant products / options | PARTIAL | schema supports N variants with free-form `attributes`; creation path writes one; no option-set model | UX + model | P1 | M |
| SKU uniqueness | EXISTS | `ProductVariant.sku @unique` | — | — | — |
| Barcode / GTIN | MISSING | no column | Model | P2 | S (additive) |
| Brands, categories | EXISTS | unique brand name/slug; `/admin/brands` | — | — | — |
| Brand aliases / near-duplicate detection | PARTIAL | `Synonym` model serves search, not brand dedupe | Correctness | P2 | M |
| Category-specific attribute schemas | MISSING | `attributes` and `specs` are untyped JSON | Model | P2 | M |
| Collections (manual/smart) | N/A for now | `Room`/`RoomCategory` cover curated grouping | — | Future | — |
| Bulk CSV import with preview | EXISTS | preview → import, all-or-none, re-run safe (existing skipped) | — | — | — |
| XLSX import, column mapping | MISSING | CSV only, fixed header `CATALOGUE_HEADER` | UX | P1 | M |
| Import jobs, history, resumable batches | MISSING | single transaction per file, no job table | Ops | P1 | M |
| Bulk **update** (price/stock) from file | MISSING | updates refused by design (ISS-068 open) | UX, **blocked on owner** | P1 | M |
| Inventory by location | EXISTS | `Inventory (variant, warehouse)` unique; checkout resolves one warehouse | — | — | — |
| Adjustments with reason + actor | EXISTS | `adjustStock` guarded compare-and-set, reason enum, actor email | — | — | — |
| Stock ledger covers sales and cancels | **PARTIAL → fixed on this branch** | before: `checkout.ts` decrement and `orders.ts` `restock` wrote no movement; ledger page said so | Correctness | **P0** | S |
| Ledger reconciliation (drift detection) | **MISSING → added on this branch** | `findLedgerDrift` | Correctness | P0 | S |
| Opening balances for pre-ledger stock | MISSING | stock seeded/imported without a movement | Correctness, needs approval | P1 | S |
| Reservations (`qtyReserved`) | MISSING (deferred) | nothing writes `qtyReserved`; `InventoryReservation` deferred in `CLAUDE.md` | — | Deferred | — |
| Transfers between warehouses | PARTIAL | `transfer` reason exists; a transfer is two manual adjustments, not one atomic move | Correctness | P2 | S |
| Purchase orders, receiving, suppliers | MISSING | `/admin/purchasing` says it does not exist; `/admin/suppliers` is a shell; ISS-062 (no cost price) | Model + UX | P1 | L |
| Low-stock alerts | PARTIAL | `admin/stock.ts` hardcodes `LOW_STOCK_THRESHOLD = 10`, ignores `Inventory.lowStockThreshold`; "low" filter includes out-of-stock rows while the "low" count excludes them | Correctness (display) | P2 | S |
| Price changes, bounded | EXISTS | `setVariantPrice` bounds; commercial review invalidated on change | — | — | — |
| Price lists / trade tiers | MISSING | blocked on owner (trade pricing) | — | Blocked | — |
| Discounts / coupons | EXISTS | `Coupon`, `CouponRedemption`, atomic redeem at checkout | — | — | — |
| Tax rules (GST/HSN) | PARTIAL | `tax.ts` category configs; real rates blocked on owner's CA | — | Blocked | — |
| Order lifecycle, fulfilment, shipments | EXISTS — not re-traced | `order-flow.ts`, `shipments.ts`, `/admin/dispatch` | — | — | — |
| Payment capture, webhook dedupe | EXISTS — not re-traced | `payments.ts`, `gatewayEventId` unique | — | — | — |
| Returns, refunds, restock | PARTIAL | `admin/returns.ts` intake + review only: "no refund, no restock, no exchange" — policy blocked on owner | — | Blocked | — |
| Staff roles / permissions | MISSING | `authz.ts`: `ADMIN_EMAILS` allowlist; `/admin/staff` states every operator needs full admin | Security | P1 | M |
| Audit log | PARTIAL | `AuditLog` exists; ISS-015 PARTIAL | Security | P1 | M |
| Inventory valuation | MISSING | ISS-062 — no cost price | Finance | P1 | M |

## 3. Catalogue and inventory technical design

**Reuse, don't replace.** The model already has the Shopify-shaped pieces:
inventory item = `ProductVariant`, location = `Warehouse`, level =
`Inventory`, ledger = `StockMovement`. No second source of truth is needed or
proposed. `Inventory.qtyOnHand` stays the authoritative count; the ledger
explains it.

**Stock invariants** (each enforced where stated):

1. `qtyOnHand ≥ 0` — checkout `updateMany … gte qty`; `adjustStock` refuses
   negative. *Not* a DB `CHECK` constraint yet (backlog P1-4).
2. One inventory row per variant per warehouse — `@@unique`.
3. Every change to `qtyOnHand` made by the app writes exactly one movement in the
   same transaction, and that movement's `qtyAfter` equals the count it left —
   **true as of this branch** for console adjustments, sales, order cancels,
   shipment cancels and the expiry cron (which goes through
   `releaseOrderInventory`). Not true for: fixtures/QA scripts
   (`qa-fixture.ts`, `qa-delhi-trial.ts`), product creation's opening stock
   (already writes a `received` movement), and anything run outside the app.
4. The newest movement's `qtyAfter` = `qtyOnHand`, otherwise the row is
   *drift* — detected by `findLedgerDrift`, never auto-corrected.
5. A unit is released at most once — order-row compare-and-set + shipment
   status (ISS-090); the ledger now makes a double release visible as two
   `released` rows for one order.

**Transaction boundaries.** Order + items + coupon redeem + stock decrement +
sale movements + shipments commit together (`placeOrder`). Cancel = order CAS +
shipment close + release + release movements together. No external call
happens inside either — Razorpay is asked *before* the cancel transaction opens
(`cancelOrder`, E5).

**Migration strategy.** Additive only (enum value). Expand/contract is not
needed. Opening balances for pre-ledger stock should be written as `recount`
movements by an operator, or by a one-off script the owner approves — not
inferred by a migration.

## 4. Merchant workflow design

Built on the existing ops console (`components/admin/ops-*`), no new libraries.

- **Find a product.** `/admin/products` gains a search box (title, SKU, brand)
  and filters for status, brand, category and *readiness* (missing price /
  approved image / stock / identity approval), each readiness reason as a
  column chip so "incomplete drafts" is a filter, not a hunt. Backed by
  `adminListProducts(filters)`; readiness reasons reuse `sellableReasons`.
- **Add a product.** `/admin/listing` keeps its single-variant fast path (most
  construction SKUs are one variant per listing) and gains "add another
  variant" rows sharing the product's brand/category; drafts never require
  price, image or stock; publish stays behind `sellableReasons`.
- **Update a price.** Existing editor + `setVariantPrice`; show "this clears the
  commercial review" before saving (it already does so server-side).
- **Receive stock.** Inventory row → "Receive" → quantity + note → `adjustStock`
  with `received`. Already possible; becomes a goods receipt against a PO when
  purchasing exists.
- **Correct a discrepancy.** Inventory row → "Recount" → counted number; the
  delta is computed server-side and written as `recount` with a required note.
  The stock-ledger drift panel links each disagreeing row here.
- **See low stock.** Use each row's `lowStockThreshold` instead of the constant.
- **Import a supplier sheet.** Keep preview → import; add an import-job record
  (who, when, file hash, created/skipped/failed per row) so a re-run is visibly
  a no-op and history is readable.
- **Inspect movement history.** `/admin/stock-ledger` — now complete for
  app-made changes, with the drift panel.

## 5. Prioritised backlog

| # | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| **P0-1** | ~~Ledger rows for sales and cancels + drift reader~~ **done on this branch** | — | `stock-ledger-completeness.test.ts` 7/7; 5 fail without the fix |
| **P0-2** | Product list search, filters, readiness columns | — | Search by SKU returns the product; filter "missing approved image" returns exactly the drafts `sellableReasons` would refuse for that reason; service test + 393/1440 screenshots |
| P0-3 | Read-only staging count of products by status and readiness, to replace the historical 979 figure | staging read access | A dated count recorded in the release notes, run by an authorised person |
| P1-1 | Opening-balance recount for stock with no ledger history | owner approval | After it runs, `findLedgerDrift().unledgeredCount = 0` and every row's newest `qtyAfter` = `qtyOnHand` |
| P1-2 | Use `Inventory.lowStockThreshold`; make "low" exclude out-of-stock consistently | — | Filter and count agree; test with thresholds 0, 5, 50 |
| P1-3 | Import job history (table + list) | — | Re-uploading a file shows "0 created, N skipped" against the same file hash |
| P1-4 | `CHECK (qty_on_hand >= 0)` on `inventory` | staging data check | Migration refuses on negative rows; a direct negative update fails |
| P1-5 | Multi-variant creation in the listing form | — | One product with 3 variants and distinct SKUs created in one save; duplicate SKU refused |
| P1-6 | Atomic warehouse transfer | — | One action writes two `transfer` movements in one transaction; failure moves nothing |
| P1-7 | Staff roles beyond the email allowlist | owner: who needs what | A non-owner operator cannot change a price |
| P2 | Barcode column; brand alias dedupe; typed category attributes; `adjustStock` stops mapping every error to `raced` | — | — |
| Blocked | Bulk price/stock *update* by file (ISS-068), trade price lists, GST rates, returns restock/refunds, cost price (ISS-062), reservations | owner | — |

## 6. First implementation (this branch)

**Change.** Every stock change the order path makes now writes a ledger row in
the same transaction:

- `lib/services/checkout.ts` — after each line's unchanged guarded decrement,
  a `sold` movement (`qtyDelta = −qty`, `orderId`, note = order number).
- `lib/services/orders.ts` — `restock` writes a `released` movement naming the
  warehouse the goods actually went back to; a restock with no inventory row is
  logged (`restock_no_inventory_row`) instead of silently dropped. Behaviour of
  the counts themselves is unchanged.
- `lib/services/inventory-movements.ts` — `recordSystemMovement` (reads
  `qtyAfter` back under the caller's row lock) and `findLedgerDrift`
  (read-only).
- `prisma/schema.prisma` + migration `20261016120000_stock_movement_released` —
  additive enum value.
- `app/admin/stock-ledger/page.tsx` — label for *Released*; the banner that
  said "a row is missing for every sale" now says what is and is not recorded;
  a drift panel lists counts that disagree with the ledger.
- Tests: `lib/services/__tests__/stock-ledger-completeness.test.ts` — sale,
  cancel nets to zero, shipment cancel releases once, failed checkout writes
  nothing, two customers racing for the last unit, idempotent replay, drift
  detection.

## 7. Release impact

- **Migration risk.** One `ALTER TYPE … ADD VALUE`. Non-blocking, no rewrite.
  Migrations run automatically on deploy (ISS-024), so merging this into a
  deployed branch applies it.
- **Behaviour change.** Checkout and cancel each do one extra indexed read and
  one insert per line inside their existing transactions. The row lock is
  already held, so lock ordering (order → shipment → inventory) is unchanged.
- **Ledger-page meaning.** After deploy, every stocked row that predates the
  ledger shows in the *no history yet* count; any row whose count was changed
  outside the app after its last movement shows as drift. That is expected and
  is the point; nothing is corrected automatically.
- **Rollback.** Revert the code; the enum value stays and is harmless (no older
  code reads or writes it). Movement rows already written stay valid history.
- **Not verified.** The ledger page was not rendered in a browser: the admin
  console needs a real Firebase session for an allow-listed email, which this
  session cannot create. Needs a screenshot on staging by an operator before
  release sign-off.
- **Approvals needed.** Merge into the integration line (integrator). Opening
  balances (P1-1) — owner. Staging count (P0-3) — whoever holds staging read
  access.
