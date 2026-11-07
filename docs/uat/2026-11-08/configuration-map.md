# Client UAT — where each business value lives (deliverable D)

Paths are relative to the repository root. "Staging DB" is the Supabase project
`gjhxhmcsuhxcmrvtkggz`; production is `gsfslnxvwmrgulzqypdp`. No secret values appear
in this document; secret *names* only.

## Pricing

| What | Where | Notes |
|---|---|---|
| Selling price per SKU | `product_variants.price_paise` (Prisma `ProductVariant.pricePaise`, `prisma/schema.prisma`) | Integer paise. Server resolves price on every cart read; `cart_items` stores no price. |
| MRP per SKU | `product_variants.compare_at_paise` (`compareAtPaise`) | Optional. Selling at MRP is allowed; selling **above** MRP is refused (commit 96b60e3, PR #29). |
| Quantity price tiers | `bulk_price_tiers` | None set on staging. |
| Approved way to change prices | Admin → **Catalogue update** (`app/admin/catalogue-update/`, parser `lib/catalogue-update-csv.ts`) — dry-run preview, audit, then apply | Column `mrp_evidence` records where each MRP came from. Price edits revoke the commercial review (DB trigger), so a re-review follows. |
| Commercial / identity approval | `products.commercial_review` (JSON), `products.identity_confirmed`, `identity_approved_*`; Admin → **Catalogue approvals** (`app/admin/catalogue-approvals/`) | A product is purchasable only when both are set and `status = published` (`lib/catalog-visibility.ts`). |
| Owner record of the decision | `docs/OWNER_INPUT_REQUIRED.md` row 4.1 "Real MRP and selling price per SKU" | **AWAITING** — "Every current price is invented". |
| Free-delivery threshold | `lib/services/cart.ts:10` `FREE_DELIVERY_THRESHOLD_PAISE = 50000` | Hard-coded guess (CLAUDE.md "Do Not Build Yet"). Owner value needed. |
| GST rate per product | `lib/services/tax.ts`, HSN/GST mapping checked at publication (`docs/CATALOGUE_SAFETY_HANDOFF.md`) | Requires the owner's CA. Checkout currently shows 18 % GST *included* (₹30.36 on ₹199). |

## Inventory

| What | Where | Notes |
|---|---|---|
| Stock on hand / reserved | `inventory.qty_on_hand`, `inventory.qty_reserved` (unique per `variant_id` + `warehouse_id`) | Decrement is race-free (`updateMany` + `gte`). |
| Movement ledger | `stock_movements` (`reason`, `qty_delta`, `qty_after`, `note`, `actor_email`) | Admin → **Stock ledger** (`app/admin/stock-ledger/`). |
| Warehouses | `warehouses` | Staging: `Srinagar Central` `00000000-0000-0000-0000-000000000001`; `Delhi QA — staging trial` `601cde75-…`. |
| UAT opening stock (new) | `lib/services/admin/uat-inventory.ts`, CLI `scripts/prepare-client-uat.mts` | One-time recount to 50 per active SKU. Marker: `audit_logs.action = 'uat.opening_inventory_initialized'` (one per variant). Reruns skip marked SKUs. |
| Release on cancel | `lib/services/orders.ts` `releaseOrderInventory`, `cancelOrder` | Restores stock to the warehouse that was decremented. |
| Manual adjustment | Admin → **Inventory** (`app/admin/inventory/`) "Adjust" | Writes a `stock_movements` row and audit entry. |

## Payments (Razorpay)

| What | Where | Notes |
|---|---|---|
| Gateway selection | env `PAYMENT_GATEWAY` (`dummy` / `razorpay-test` / `razorpay-live`); `lib/services/payments.ts` `activeGateway()`, `assertPaymentConfig()` | Production refuses `dummy` and `razorpay-test`. |
| Test-mode opt-in (staging only) | env `ALLOW_TEST_GATEWAY=1` + key id starting `rzp_test_` | Set in `apphosting.staging.yaml`. Must never be set on production. |
| Key id (public) | env `RAZORPAY_KEY_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Staging: in `apphosting.staging.yaml`. Production: **not present** (`apphosting.production.yaml` has no payment variable). |
| Key secret | Secret Manager → env `RAZORPAY_KEY_SECRET` | Staging: present (test). Production: **missing** (live keys pending). |
| Webhook secret | Secret Manager → env `RAZORPAY_WEBHOOK_SECRET` | Staging: present. Production: **missing**. Webhook route `app/api/webhooks/razorpay/route.ts`. |
| Signature checks | `verifyRazorpaySignature`, `verifyRazorpayWebhook` (`lib/services/payments.ts:571,586`) | `crypto.timingSafeEqual`; dedupe on `payments.gateway_event_id` (unique). |
| Payment records | `payments` (`status`, `signature_verified`, `gateway_event_id`, `amount_paise`) | |
| Refunds | `payment_refunds`; `lib/services/refunds.ts` (`requestRefund`, `applyRefundWebhook`); Admin → **Payments** | Calls the Razorpay refund API with whatever keys are configured. |
| Trading mode | env `COMMERCE_MODE` (`transactional` / `catalogue`), `lib/commerce-mode.ts` | Production = `catalogue` (refuses every order and payment). Leave until launch authorisation. |

## Delivery

| What | Where | Notes |
|---|---|---|
| Serviceable pincodes, ETA, fee, COD per pincode | `serviceable_pincodes` (`eta_minutes`, `delivery_fee_paise`, `cod_allowed`, `warehouse_id`, `is_active`); Admin → **Serviceability** (`app/admin/serviceability/`, CSV `lib/serviceability-csv.ts`) | Staging rows are seed data: ETA 60 min, fee ₹0. Checkout displays "About 60 minutes" and "FREE" from these — **test data, not a promise**. |
| COD | env `COD_DISABLED=1` (both backends) + setting `cod.enabled` + `cod.ceiling_paise` (`lib/services/settings.ts`) | Owner decision: COD off. |
| Express delivery | settings `delivery.express_minutes`, `delivery.express_fee_paise`; `product_express_pincodes` | |
| Ops SLAs | settings `ops.pack_sla_minutes`, `ops.delivery_sla_minutes` | |
| Shipping policy text | `lib/content.ts` key `shipping` → `/shipping` (`app/(content)/shipping/page.tsx`) | `[Re-delivery terms to be confirmed.]` |

## Returns and refunds policy

| What | Where | Notes |
|---|---|---|
| Public policy text | `lib/content.ts` key `refunds` → `/refunds` (`app/(content)/refunds/page.tsx`) | **Currently describes voluntary return windows** (`[return window]`, `[reporting window]`, `[refund timeline]`). Contradicts the proposed "no voluntary returns" draft; rewrite only after the owner approves the policy. |
| Draft notice for testers (new) | `components/uat-notice.tsx` (rendered in `app/layout.tsx`) | Staging-only; marks the no-voluntary-returns policy DRAFT and keeps statutory remedies. |
| Return workflow | `return_requests`, `return_request_items`; `lib/return-flow.ts`; Admin → **Returns** (`app/admin/returns/`) | Exists; never exercised on staging (0 rows). |

## Business identity and legal contacts

| What | Where | Notes |
|---|---|---|
| Legal entity, registered address, GSTIN, CIN | `lib/content.ts` key `terms` (line ~126: "Business name, registered address, GSTIN and CIN: [to be confirmed]") | |
| GSTIN on invoices | setting `company.gstin` (Admin → **Settings**) | Unset on staging ("No GSTIN is set" exception). |
| Contact page, opening hours, email | `lib/content.ts` key `contact`, `app/(content)/contact/page.tsx` | `[Opening hours to be confirmed.]` |
| Privacy / data retention | `lib/content.ts` key `privacy` | `[Retention period to be confirmed with our accountant.]` |
| Site URL | env `NEXT_PUBLIC_SITE_URL` in `apphosting.*.yaml` | |
