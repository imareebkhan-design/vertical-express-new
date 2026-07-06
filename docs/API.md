# Vertical Express — API Design (Phase 5)

Split: **Route Handlers** for public cacheable GETs + webhooks/SEO; **Server Actions** for all authenticated/stateful mutations (typed, CSRF-safe, co-located with forms). Every action validates with zod and returns `{ ok: true, data } | { ok: false, error: { code, message, field? } }`.

## Public catalog (Route Handlers — cacheable)

| Method & path | Query/body | Returns | Cache |
| --- | --- | --- | --- |
| `GET /api/products` | `category, subcategory, brand[], type[], minPrice, maxPrice, sort(popular|price_asc|price_desc|newest|discount), page, perPage≤48` | `{ items: ProductCard[], facets, total, page }` | 60 s + tag `catalog` |
| `GET /api/products/[slug]` | — | full PDP payload (variants, tiers, images, specs, rating, related) | tag `product:{id}` |
| `GET /api/categories` | — | tree with counts | tag `catalog` |
| `GET /api/search/suggest` | `q` (≥2 chars) | `{ products[≤6], categories[≤3], brands[≤3] }` | 300 s, rate-limited |
| `GET /api/serviceability/[pincode]` | — | `{ serviceable, etaMinutes, deliveryFeePaise, codAllowed }` | 3600 s |
| `GET /api/sitemap.xml`, `GET /api/robots.txt` | — | SEO artifacts | daily |

Page-level data (PLP/PDP/search SSR) calls `lib/services/catalog.ts` directly — the route handlers exist for client-side pagination/filter updates and future mobile app reuse.

## Auth (Server Actions — `actions/auth.ts`)

- `sendOtp({ phone })` — rate-limited 3/10 min; creates/updates auth user.
- `verifyOtp({ phone, token })` — establishes session; merges guest cart (`anon_id` → `user_id`).
- `signOut()`
- `updateProfile({ fullName, email?, gstin?, companyName?, marketingOptIn })`

## Cart (`actions/cart.ts`) — guest-capable via `anon_id` cookie

- `addToCart({ variantId, qty })` → returns cart summary + applied tier; optimistic on client.
- `updateCartItem({ itemId, qty })` (qty 0 ⇒ remove)
- `removeCartItem({ itemId })`
- `applyCoupon({ code })` / `removeCoupon()`
- `getCart()` (server fn) → lines with live pricing: unit price, tier applied, next-tier nudge, totals, free-delivery progress.

## Wishlist (`actions/wishlist.ts`, auth required)

- `toggleWishlist({ productId })` → `{ added: boolean }`
- `moveToCart({ productId })`

## Addresses (`actions/address.ts`, auth)

- `createAddress(AddressInput)` / `updateAddress(id, AddressInput)` / `deleteAddress(id)` / `setDefaultAddress(id)`
- AddressInput zod: pincode regex + serviceability check server-side.

## Checkout & Orders (`actions/checkout.ts`, `actions/orders.ts`, auth)

- `beginCheckout()` → validates stock, reprices, reserves (`qty_reserved += qty`, 15-min TTL), returns totals.
- `placeOrder({ addressId, paymentMethod, notes? })` →
  - COD: create order `confirmed`, decrement stock, fire notifications, return `{ orderNo }`.
  - Razorpay: create order `pending_payment` + gateway order, return `{ razorpayOrderId, amount, key }`.
- `confirmRazorpayPayment({ orderId, razorpayPaymentId, razorpayOrderId, signature })` — verify signature → `confirmed`.
- `cancelOrder({ orderId, reason })` — allowed while status ∈ {pending_payment, confirmed}; releases stock; auto-refund if captured.
- `reorder({ orderId })` — copies items to cart (revalidated pricing).
- `getMyOrders({ page })`, `getOrder({ orderNo })` — RLS-scoped.

**Webhook** `POST /api/webhooks/razorpay` — signature check, idempotent on `event.id`; handles `payment.captured`, `payment.failed`, `refund.processed`; reconciles order/payment status; audit-logged.

## Services & Quotes (`actions/booking.ts`, `actions/quote.ts`)

- `createBooking({ serviceSlug, propertyType, scope, preferredDate, addressId | address, phone })` — auth optional at submit (phone captured), linked to user on login.
- `getMyBookings()`
- `submitQuote({ source, lineItems? , attachment?, pincode, targetDate, notes })` (BOQ upload → Storage)
- `acceptQuote({ quoteId })` → converts to prefilled checkout.

## Admin (`actions/admin/*` — permission-checked per action)

- Catalog: `upsertProduct`, `upsertVariant`, `setBulkTiers`, `uploadProductImage`, `setInventory`, `upsertCategory/Brand`, `importProductsCsv`.
- Orders: `advanceOrderStatus({ orderId, to })` (state-machine enforced), `issueRefund`.
- Bookings/Quotes: `assignProfessional`, `priceQuote`.
- CMS: `upsertBanner/Blog/Faq`, `updateSettings`.
- All admin GETs are server components reading `lib/services/admin/*` with pagination.

## Error codes (shared)

`UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION, OUT_OF_STOCK, PINCODE_UNSERVICEABLE, COUPON_INVALID, PAYMENT_FAILED, RATE_LIMITED, CONFLICT` — mapped to toasts/inline messages by a single client helper.
