# `/api/v1` — the native app's contract

Every route is a thin door onto an existing service in `lib/services/*`. Rules
about price, stock, tax, delivery and payment live there and nowhere in this
layer. Handlers are in `lib/api/v1.ts`; route files are one-liners.

**Envelope.** Success `{ "ok": true, "data": … }`. Failure
`{ "ok": false, "error": { "code", "message", "field?", "metadata?" } }`. The
HTTP status follows the code (`lib/api/response.ts`): `UNAUTHENTICATED` 401,
`VALIDATION` 400, `NOT_FOUND` 404, `OUT_OF_STOCK`/`ONLY_X_LEFT`/`CONFLICT` 409,
`PINCODE_UNSERVICEABLE`/`COUPON_INVALID` 422, `PAYMENT_FAILED` 402,
`RATE_LIMITED` 429. (A 402 with `x-vercel-error: DEPLOYMENT_DISABLED` is Vercel
billing, not this API.)

**Auth.** `Authorization: Bearer <Firebase ID token>`, verified server-side by
`resolveApiIdentity`. Money is integer paise. Shelf prices are GST-inclusive:
`subtotalPaise + taxPaise` is the shelf total.

| Method | Path | Auth | Request | Response `data` | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/categories` | none | — | categories with product counts | 429 |
| GET | `/api/v1/products` | none | `?category&q&sort&page&perPage(≤50)` | `CatalogResult` (items, facets, paging) | 429 |
| GET | `/api/v1/products/:slug` | none | — | `ProductDetail` (variants carry `id`, `pricePaise`, `inStock`) | 404 |
| GET | `/api/v1/serviceability/:pincode` | none | — | `{serviceable, etaMinutes, deliveryFeePaise, codAllowed}` | 400 |
| POST | `/api/v1/cart/items` | Bearer | `{variantId, qty}` | `CartSummary` | 400, 401, 404, 409 |
| GET | `/api/v1/cart` | Bearer | — | `CartSummary` | 401 |
| PATCH | `/api/v1/cart/items/:itemId` | Bearer | `{qty}` (0 removes) | `{summary, adjustment?}` — `adjustment` when clamped to stock | 400, 401, 404 |
| DELETE | `/api/v1/cart/items/:itemId` | Bearer | — | `CartSummary` | 401 |
| GET | `/api/v1/addresses` | Bearer | — | caller's addresses | 401 |
| POST | `/api/v1/addresses` | Bearer | address (`addressInputSchema`) | `{id, serviceable}` | 400 (`field`), 401 |
| POST | `/api/v1/checkout/totals` | Bearer | `{pincode, couponCode?, wantsExpress?}` | `CheckoutTotals` | 400, 401, 409 (empty cart) |
| POST | `/api/v1/checkout/orders` | Bearer | `{addressId, paymentMethod:"online"\|"cod", idempotencyKey, couponCode?, notes?, wantsExpress?}` | `{orderNo, status, razorpay:{orderId,amountPaise,keyId}\|null}` | 400, 401, 404, 409, 422 |
| POST | `/api/v1/orders/:orderNo/confirm-payment` | Bearer | `{razorpayOrderId, razorpayPaymentId, signature}` | `{orderNo, status:"confirmed"}` | 400, 401, 402 |
| GET | `/api/v1/orders` | Bearer | `?page` | `{orders, total, page, perPage}` | 401 |
| GET | `/api/v1/orders/:orderNo` | Bearer | — | order detail + `events`; `razorpay` while `pending_payment` | 401, 404 |

## Payment

`checkout/orders` never confirms an online payment. It leaves the order
`pending_payment` and returns the Razorpay order to open. The device reports
what Razorpay handed it; `confirm-payment` believes it only if the HMAC verifies
against the server's secret **and** the Razorpay order id equals the one this
order's payment row was created with **and** the order belongs to the caller
(`confirmOnlinePayment` in `lib/services/checkout.ts`). Every refusal is the same
402. The Razorpay webhook remains the independent authority and confirms the
order even if the device never calls back.

A pending order that is not paid is expired by `/api/cron/cleanup-orders`
(15 min) and its stock released. A device that lost its Razorpay details reads
them back from `GET /orders/:orderNo`.

## Not in this contract (deferred)

Guest carts, coupons UI, order cancel/reorder, address edit/delete, wishlist,
search suggestions, order-confirmation email for phone-only accounts.
