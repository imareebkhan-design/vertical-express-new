# Vertical Express — Database Design (Phase 4)

## Catalogue approval update — 9 October 2026

The Prisma schema and named migrations are authoritative; older Phase 4 descriptions below predate Firebase authentication and the PostgREST RLS lockdown. Application users link to Firebase through `firebase_uid`; admin authorization requires a verified email on `ADMIN_EMAILS`, not merely `users.role`.

Products default to `draft`. Public catalogue readers share `lib/catalog-policy.ts`: active brand/category, explicit product identity approval with actor/time/reason, and an explicitly approved primary image. `catalog_only` records can be browsed but never purchased. Published records additionally require a priced default variant, configured active-warehouse inventory and an owner commercial review; admin creation/import/save and cart/checkout apply the complete commercial validator.

Product identity fields: `identity_confirmed`, `identity_approved_at`, `identity_approved_by`, `identity_approval_reason`. Image fields: `source_verified`, `identity_approved`, `approval_status`, `severity`, `approved_at`, `approved_by`, `approval_reason`. Provenance or a checksum alone is insufficient. Database checks require metadata and a valid SHA-256, reject P0/P1 approval, and permit explicit P2/P3 limitations. Approval statuses are `APPROVED_EXACT`, `APPROVED_WITH_LIMITATION`, `REVIEW_REQUIRED`, `REJECTED`.

Image approval is revoked on changes to product association, URL, checksum, source URL or licence. Source URL/licence changes deliberately require re-review because provenance or usage permission may have changed. Caption, dimensions and sort metadata alone preserve approval. Product identity edits revoke identity approval. Commercial review is a JSON snapshot of owner metadata, unit/pack, delivery class, HSN/GST and each active variant's SKU, pack, name, default flag, selling price and optional MRP. Material product/variant changes clear that review; current tax mapping must still match at validation. Ordinary stock changes do not revoke identity/image/commercial approvals.

New migrations: `20261008170000_catalogue_explicit_approval`, `20261008171000_catalogue_commercial_review`, `20261009100000_catalogue_commercial_invalidation`, `20261009110000_catalogue_variant_set_review`. Active variant insertion/deletion also revokes commercial review. No historical owner approvals are backfilled. Applied only to the isolated local test database during this work. Release integrator must plan schema deployment and evidence-backed approval separately. Rollback retains the additive schema and fail-closed gate; undo a release through a reviewed corrective change or scoped, audited reversal of an approval batch, not dropping columns or broadly demoting catalogue-only products. The 263-row legacy slug-only batch is rejected by activation until exact reviewed hashes are supplied.

Approval-sensitive catalogue services and pages do not use persistent result/route caches. Category counts, room shelves, search, recommendations, product pages and sitemap read the current central policy. This deliberately trades additional database reads for immediate enforcement on the next request.

`test-support/catalogue-fixtures.ts` is test-only and refuses non-local or non-disposable databases. It does not grant production approval. No staging fixture bypass, staged product activation or production deployment is included in this gate.

PostgreSQL via Prisma. Conventions: `id uuid pk default gen_random_uuid()`, `created_at/updated_at timestamptz` on every table (omitted below for brevity), money as **integer paise**, soft-delete via `deleted_at` only where noted. RLS: user-owned tables policy `user_id = auth.uid()`; catalog tables are public-read, admin-write.

## Identity

**users** (mirrors Supabase `auth.users` via trigger)
- `id uuid pk` (= auth.uid), `phone text unique`, `email text unique null`, `role enum(customer, admin, vendor, professional) default customer`
- Validation: phone E.164; email RFC. Index: `phone`, `email`.

**profiles** — 1:1 users
- `user_id fk unique`, `full_name text`, `avatar_url text`, `gstin text null`, `company_name text null`, `default_address_id fk null`, `marketing_opt_in bool default false`, `first_utm jsonb`
- Validation: gstin regex (15 chars). Index: `user_id`.

**addresses** — N:1 users
- `user_id fk`, `label enum(home, site, office, other)`, `name`, `phone`, `line1`, `line2 null`, `landmark null`, `city`, `state`, `pincode char(6)`, `lat/lng numeric null`, `place_id text null`, `access_note null`, `is_default bool`, `deleted_at`
- Validation: pincode `^[1-9][0-9]{5}$`. Index: `(user_id, is_default)`, `pincode`.

**admin_users** — `user_id fk unique`, `permissions jsonb` (see permissions), `is_active bool`.

**permissions** — `key text pk` (e.g. `orders.write`, `catalog.write`, `cms.write`), `description`. `admin_users.permissions` stores granted keys; checked in `lib/services/admin/authz.ts`.

## Catalog

**categories**
- `slug text unique`, `name`, `group enum(civil_interiors, furniture_hardware, electrical, plumbing_bath, tools, other)`, `image_url`, `description text`, `is_bulk bool`, `sort_order int`, `is_active bool`, `seo_title/seo_description`
- Index: `slug`, `(group, sort_order)`.

**subcategories** — N:1 categories; `category_id fk`, `slug unique`, `name`, `sort_order`. Index: `(category_id, sort_order)`.

**brands** — `slug unique`, `name unique`, `logo_url`, `is_active`. Index: `slug`.

**products**
- `slug text unique`, `title`, `brand_id fk`, `category_id fk`, `subcategory_id fk null`, `vendor_id fk null` (future), `description text`, `specs jsonb` (key/value list), `unit_label text` ("per bag"), `status enum(draft, catalog_only, published, archived)` (catalog_only: migration `20261008120000_product_status_catalog_only`, visible but never purchasable — rules in `lib/catalog-visibility.ts`), `is_deal bool`, `rating_avg numeric(2,1) default 0`, `rating_count int default 0`, `search tsvector` (generated: title+brand+category), `seo_title/seo_description`
- Validation: title 3–160; slug kebab. Index: `slug`, `(category_id, status)`, `(brand_id, status)`, `GIN(search)`, `trgm(title)`.

**product_images** — N:1 products; `product_id fk`, `url`, `alt`, `sort_order`, `is_primary bool`. Index: `(product_id, sort_order)`. Provenance (migration `20261006120000_product_image_provenance`, all nullable): `source_url`, `licence`, `width`, `height`, `sha256 char(64)`; unique `(product_id, sha256)` so an image import re-run is a no-op (rows without a sha256 are unconstrained).

**product_variants** — N:1 products (every product ≥ 1 variant)
- `product_id fk`, `sku text unique`, `name` ("50 kg bag", "White, 20 L"), `attributes jsonb`, `price_paise int`, `compare_at_paise int null`, `is_default bool`, `is_active bool`
- Validation: price > 0; compare_at ≥ price ⇒ reject. Index: `sku`, `(product_id, is_default)`.

**bulk_price_tiers** — N:1 product_variants
- `variant_id fk`, `min_qty int`, `price_paise int`
- Unique `(variant_id, min_qty)`; validation min_qty ≥ 2, tier price < base price.

**inventory** — variant × warehouse
- `variant_id fk`, `warehouse_id fk`, `qty_on_hand int`, `qty_reserved int`, `low_stock_threshold int`
- Unique `(variant_id, warehouse_id)`; check `qty_on_hand ≥ 0`, `qty_reserved ≥ 0`.

**warehouses** — `name`, `city`, `pincode`, `is_active`.

**serviceable_pincodes** — `pincode char(6) unique`, `warehouse_id fk`, `eta_minutes int`, `delivery_fee_paise int`, `cod_allowed bool`, `is_active`. Index: `pincode`.

## Commerce

**carts** — `user_id fk null unique` (null = guest, keyed by `anon_id`), `anon_id uuid null unique`, `coupon_id fk null`. Index: `user_id`, `anon_id`.

**cart_items** — N:1 carts; `cart_id fk`, `variant_id fk`, `qty int`, unique `(cart_id, variant_id)`; check qty 1–999. Price is computed at read time (never stored) so tiers stay live.

**wishlists** — `user_id fk unique`. **wishlist_items** — `wishlist_id fk`, `product_id fk`, unique pair.

**coupons**
- `code text unique (upper)`, `type enum(percent, flat, free_delivery)`, `value int`, `min_order_paise`, `max_discount_paise null`, `usage_limit int null`, `per_user_limit int default 1`, `first_n_orders int null` (models "first 3 orders"), `starts_at/ends_at`, `is_active`
- Index: `code`. Validation: percent 1–100.

**orders**
- `order_no text unique` (human: VE-2026-000123), `user_id fk`, `address jsonb` (snapshot), `status enum(pending_payment, confirmed, packed, out_for_delivery, delivered, cancelled, refund_initiated, refunded)`, `payment_method enum(razorpay, cod)`, `subtotal_paise`, `discount_paise`, `delivery_fee_paise`, `total_paise`, `coupon_code text null`, `eta_minutes int null`, `warehouse_id fk`, `notes`, `placed_at`, `delivered_at null`, `cancelled_reason null`, `expiry_checked_at null` (ISS-078 — see below)
- Index: `(user_id, placed_at desc)`, `status`, `order_no`, `(status, expiry_checked_at, placed_at)`.

**order_items** — snapshot lines
- `order_id fk`, `variant_id fk`, `title`, `variant_name`, `image_url`, `unit_price_paise`, `applied_tier_min_qty int null`, `qty`, `line_total_paise`
- Index: `order_id`.

**payments**
- `order_id fk`, `gateway enum(razorpay, cod)`, `gateway_order_id`, `gateway_payment_id null`, `gateway_event_id text unique null` (idempotency), `amount_paise`, `status enum(created, authorized, captured, failed, refunded)`, `signature_verified bool`, `raw jsonb`
- Index: `order_id`, `gateway_payment_id`.

> **Change 2026-09-20** (`20260920120000_payments_gateway_order_unique`): `payments.gateway_order_id` is now **unique** (NULLs allowed, for COD), replacing the plain index. One Razorpay order = one payment row. The migration fails if duplicates exist — see the prerequisite query in its header before deploying to any shared database.

**order_status_events** — `order_id fk`, `from_status`, `to_status`, `actor_user_id null`, `note`. Powers the customer timeline. Index: `(order_id, created_at)`.

**reviews** — `product_id fk`, `user_id fk`, `order_item_id fk null` (verified-purchase), `rating int 1–5`, `title`, `body`, `status enum(pending, published, rejected)`; unique `(product_id, user_id)`. Trigger updates `products.rating_avg/count`.

## Services & Quotes

**service_categories** — mirrors `lib/services.ts`: `slug unique`, `name`, `blurb`, `icon_key`, `sort_order`, `is_active`.

**services** — N:1 service_categories; `slug unique`, `name`, `description`, `price_from_paise null`, `unit text` ("per sq ft"), `faqs jsonb`, `is_active`.

**professionals** — `user_id fk null`, `name`, `phone`, `trade enum(...16 trades)`, `rating numeric`, `is_verified`, `city`. **contractors** — same shape + `company_name`, `gstin`, `team_size`.

**bookings**
- `booking_no unique`, `user_id fk`, `service_id fk`, `address jsonb`, `property_type enum(apartment, house, plot, commercial)`, `scope text`, `preferred_date date`, `status enum(received, scheduled, visited, quoted, in_progress, completed, cancelled)`, `professional_id fk null`, `quote_id fk null`
- Index: `(user_id, created_at desc)`, `status`.

**quotes**
- `quote_no unique`, `user_id fk`, `source enum(cart, boq, booking)`, `status enum(submitted, priced, accepted, declined, expired, converted)`, `line_items jsonb`, `attachment_url null`, `total_paise null`, `valid_until date null`, `admin_notes`
- Index: `(user_id, created_at desc)`, `status`.

**projects** (future, reserved) — `user_id`, `name`, `address jsonb`, `status`; join tables `project_orders`, `project_bookings`.

## Platform

**notifications** — `user_id fk`, `type enum(order, booking, quote, promo, system)`, `title`, `body`, `href`, `read_at null`. Index: `(user_id, read_at)`.

**support_tickets** — `user_id fk`, `order_id fk null`, `subject`, `body`, `status enum(open, pending, resolved)`, `assigned_admin_id null`.

**audit_logs** — `actor_user_id`, `action text` ("order.status_change"), `entity text`, `entity_id`, `before jsonb`, `after jsonb`, `ip`. Index: `(entity, entity_id)`, `created_at`. Insert-only.

**banners** — `placement enum(hero, strip, promo)`, `title`, `subtitle`, `image_url`, `href`, `theme`, `sort_order`, `starts_at/ends_at`, `is_active`.

**blogs** — `slug unique`, `title`, `excerpt`, `body_mdx`, `cover_url`, `author`, `published_at null`, `seo_*`. **faqs** — `question`, `answer`, `category enum(orders, delivery, payments, services, returns)`, `sort_order`, `is_active`.

**settings** — `key text pk`, `value jsonb` (announcement messages, free-delivery rule, support numbers, store hours).

## Relationship map (summary)

```
users 1─1 profiles      users 1─N addresses/orders/bookings/quotes/notifications
categories 1─N subcategories/products     brands 1─N products
products 1─N images/variants/reviews      variants 1─N bulk_tiers/inventory/cart_items/order_items
warehouses 1─N inventory/serviceable_pincodes/orders
carts 1─N cart_items    orders 1─N order_items/payments/status_events
service_categories 1─N services 1─N bookings   bookings N─1 professionals, 1─1 quotes(optional)
```

---

## Shipments (migration `20260826095435_add_shipments`)

Added 26 Aug 2026. **Purely additive** — two new tables, two new enums, no column
altered or dropped on any existing table.

### Why

An order that mixes small goods with heavy material cannot have one arrival time:
the wire leaves the Srinagar store within the hour, the cement goes on a truck.
`Order.status` is a single flat enum and cannot express "shipment 1 is out for
delivery, shipment 2 has not been loaded". Every screen that shows a split — the
cart, the checkout slot pickers, the dispatch board, split COD collection —
depends on this table existing.

### Tables

**`shipments`** — one physical delivery within an order.

| Column | Notes |
|---|---|
| `order_id` | FK, cascade delete |
| `sequence` | 1-based, unique per order. Renders as "Shipment 1 of 2" |
| `speed_class` | `SpeedClass` enum |
| `status` | `ShipmentStatus` enum, defaults `pending` |
| `warehouse_id` | nullable FK |
| `promised_at` | null until slot selection exists |
| `dispatched_at`, `delivered_at` | null until the fulfilment loop is built |
| `delivery_code` | shared with the driver at the gate; null until POD is built |

**`shipment_items`** — which order lines travel in which shipment.

References `order_items` rather than `product_variants`, so the price snapshot
taken at order time is preserved and a single line can later be split across
shipments when stock is partial. Unique on `(shipment_id, order_item_id)`.

### Enums

`SpeedClass`: `express`, `scheduled`, `leadtime`, `seasonal`.
Only `express` and `scheduled` are ever written today — they derive from
`Category.isBulk`, the same flag the storefront already uses for the chip on every
product card. `leadtime` and `seasonal` are declared because the design system
defines four states and adding an enum value later costs a migration; they need a
per-variant source of truth that does not exist yet.

`ShipmentStatus`: `pending`, `packed`, `out_for_delivery`, `delivered`, `cancelled`.

### Expand / migrate / contract

This is the **expand** step. `Order.status` remains the authoritative order state
and is written exactly as before; shipments are recorded alongside it. Nothing
reads shipment status yet.

The **contract** step — deriving order state from its shipments and retiring the
flat status — is a later release, per the rule in CLAUDE.md that a column is never
dropped in the same release that stops writing it.

### Rollback

Drop `shipment_items`, then `shipments`, then the two enum types. No existing data
is touched, so a rollback loses only shipment rows written since deploy. Orders
placed before this migration have no shipments and are unaffected — any reader
must treat an empty `shipments` array as "not split", not as an error.


## Order expiry queue (migration `20260929120000_order_expiry_checked_at`, ISS-078)

`orders.expiry_checked_at timestamp(3) null` — when the payment-window expiry
(`cleanupExpiredPendingOrders`) last claimed this order to ask Razorpay about it
and left it pending. Not a business field; nothing else reads it.

- NULL = never examined. The expiry selects stale `pending_payment` orders ordered
  `expiry_checked_at NULLS FIRST, placed_at, id`, at most 20 per run, skipping any
  claimed in the last 2 minutes (the claim lease). Claiming sets it to now, which
  also moves the order to the back of the queue. Index
  `orders_status_expiry_checked_at_placed_at_idx` serves that selection.
- Additive and nullable, no backfill: existing rows are NULL and are simply
  examined first on the next run.
- **Not yet applied in production** (29 Sep 2026): applied to local
  `vertical_express_test` / `vertical_express_demo` only. The code selects on it,
  so this migration must be deployed with (before) the code — see the release
  checklist in the workspace `docs/PRODUCTION_READINESS.md`.

**Rollback.** Revert the code first (it would otherwise select on the column),
then `DROP INDEX "orders_status_expiry_checked_at_placed_at_idx"; ALTER TABLE
"orders" DROP COLUMN "expiry_checked_at";`. No other data depends on it; losing it
only loses the round-robin position, which is rebuilt as NULLs.


## Express selection (migration `20260929233000_express_selection`, E7)

- `orders.express_fee_paise integer null` — the express charge the order was placed
  with; NULL when express was not chosen or not on offer. It is already inside
  `delivery_fee_paise`, unless a free-delivery coupon waived the delivery fee (then
  it is still set: the customer chose the express run). Written by `placeOrder` from
  the server's quote (`totals.expressChosen`, `totals.express.feePaise`), never from
  the client.
- `shipments.express_run boolean not null default false` — true on the one shipment
  carrying the express run the customer chose (the express-eligible, bike-class
  lines). `speed_class` stays the vehicle class (bike or truck) and is written the
  same whether express was bought or not.
- Additive, no backfill: orders placed before it carry NULL / false, which is what
  they were — no earlier order recorded an express choice.
- **Not yet applied in production** (30 Sep 2026): local `vertical_express_test` /
  `vertical_express_demo` only. The code writes both columns on every placement, so
  this migration must be deployed **before** the code (release checklist R1) — with
  the columns missing, every placement fails (observed locally against a stale
  client: `Unknown argument expressFeePaise`, after the gateway order was created).

**Rollback.** Revert the code first, then `ALTER TABLE "shipments" DROP COLUMN
"express_run"; ALTER TABLE "orders" DROP COLUMN "express_fee_paise";`. Dropping them
loses the record of which orders bought express; export it first if any exist.

## Address place id (migration `20261008150000_address_place_id`, DEC-021)

- `addresses.place_id text null` — the Google place id of the address's pin when
  it came from address search. Written only together with `latitude`/`longitude`;
  an edit that drops the pin drops the place id too (`lib/services/addresses.ts`).
  Copied into the order's `address` snapshot alongside the coordinates.
- Additive, nullable, no backfill: existing addresses read as "no place id".
- **Not yet applied to staging or production** (8 Oct 2026): local
  `vertical_express_test` / `vertical_express_demo` only. Prisma reads every
  column of `addresses` on list and checkout, so this migration must be applied
  **before** the code that carries it is deployed — otherwise address reads fail
  with an unknown-column error.

**Rollback.** Revert the code first, then `ALTER TABLE "addresses" DROP COLUMN "place_id";`.
Nothing else reads the column.

## `product_enquiries` (migration `20261009200000_product_enquiries`, 9 Oct 2026)

"Enquire about this product" on catalog-only listings. One row per enquiry: `enquiry_no` (unique, `ENQ-YYYYMMDD-XXXXXXXX`),
`product_id` → products (RESTRICT), `product_title` / `brand_name` snapshots read from the database at submission,
optional `user_id` (signed-in customer), `name`, `phone`, optional `quantity` / `message`, `status`
(`ProductEnquiryStatus`: new, contacted, quoted, closed, spam), `admin_notes`, timestamps. RLS enabled, no
anon/authenticated grants. Admin status changes write `audit_logs` (`product_enquiry.status_changed`). Additive;
rollback = leave the table, roll the app back.

## `StockMovementReason.released` (migration `20261016120000_stock_movement_released`, 16 Oct 2026)

Additive enum value. `released` is written by the order and shipment cancel paths
(`lib/services/orders.ts` → `restock`) when goods that never left the warehouse go
back on the shelf; `sold` (already in the enum, never written until now) is written
by checkout for each line. Neither is offered to operators (`OPERATOR_REASONS`).

No column or existing row changes. **Rollback:** code only — earlier code neither
writes nor reads `released`, and the ledger page falls back to the raw reason name
for any value it has no label for. Postgres cannot drop an enum value cheaply, so
the value stays; that is harmless.
