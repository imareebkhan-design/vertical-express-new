# Vertical Express — Database Design (Phase 4)

PostgreSQL via Prisma. Conventions: `id uuid pk default gen_random_uuid()`, `created_at/updated_at timestamptz` on every table (omitted below for brevity), money as **integer paise**, soft-delete via `deleted_at` only where noted. RLS: user-owned tables policy `user_id = auth.uid()`; catalog tables are public-read, admin-write.

## Identity

**users** (mirrors Supabase `auth.users` via trigger)
- `id uuid pk` (= auth.uid), `phone text unique`, `email text unique null`, `role enum(customer, admin, vendor, professional) default customer`
- Validation: phone E.164; email RFC. Index: `phone`, `email`.

**profiles** — 1:1 users
- `user_id fk unique`, `full_name text`, `avatar_url text`, `gstin text null`, `company_name text null`, `default_address_id fk null`, `marketing_opt_in bool default false`, `first_utm jsonb`
- Validation: gstin regex (15 chars). Index: `user_id`.

**addresses** — N:1 users
- `user_id fk`, `label enum(home, site, office, other)`, `name`, `phone`, `line1`, `line2 null`, `landmark null`, `city`, `state`, `pincode char(6)`, `lat/lng numeric null`, `is_default bool`, `deleted_at`
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
- `slug text unique`, `title`, `brand_id fk`, `category_id fk`, `subcategory_id fk null`, `vendor_id fk null` (future), `description text`, `specs jsonb` (key/value list), `unit_label text` ("per bag"), `status enum(draft, published, archived)`, `is_deal bool`, `rating_avg numeric(2,1) default 0`, `rating_count int default 0`, `search tsvector` (generated: title+brand+category), `seo_title/seo_description`
- Validation: title 3–160; slug kebab. Index: `slug`, `(category_id, status)`, `(brand_id, status)`, `GIN(search)`, `trgm(title)`.

**product_images** — N:1 products; `product_id fk`, `url`, `alt`, `sort_order`, `is_primary bool`. Index: `(product_id, sort_order)`.

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
- `order_no text unique` (human: VE-2026-000123), `user_id fk`, `address jsonb` (snapshot), `status enum(pending_payment, confirmed, packed, out_for_delivery, delivered, cancelled, refund_initiated, refunded)`, `payment_method enum(razorpay, cod)`, `subtotal_paise`, `discount_paise`, `delivery_fee_paise`, `total_paise`, `coupon_code text null`, `eta_minutes int null`, `warehouse_id fk`, `notes`, `placed_at`, `delivered_at null`, `cancelled_reason null`
- Index: `(user_id, placed_at desc)`, `status`, `order_no`.

**order_items** — snapshot lines
- `order_id fk`, `variant_id fk`, `title`, `variant_name`, `image_url`, `unit_price_paise`, `applied_tier_min_qty int null`, `qty`, `line_total_paise`
- Index: `order_id`.

**payments**
- `order_id fk`, `gateway enum(razorpay, cod)`, `gateway_order_id`, `gateway_payment_id null`, `gateway_event_id text unique null` (idempotency), `amount_paise`, `status enum(created, authorized, captured, failed, refunded)`, `signature_verified bool`, `raw jsonb`
- Index: `order_id`, `gateway_payment_id`.

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
