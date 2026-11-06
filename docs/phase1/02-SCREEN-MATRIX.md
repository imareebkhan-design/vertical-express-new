# B. Screen-by-screen design and functionality matrix

68 artboards: 23 mobile (`design-canvas/`), 21 web (`web-canvas/`) and 24 ops
(`ops-canvas/`). `Main`, `Legend`, `System`, `WebSystem`, `OpsSystem` and `Teardown` are
index, legend or analysis boards and are not screens.

**How to read the matrix.** *Route* is where the screen lives in code [C]. *Visual* is how
closely the build matches the artboard, as last recorded: **VV** = visually verified
against the artboard, **SRC** = checked in source only, **—** = not compared. *Function*
uses the PRD status legend. *Blocked values* lists numbers drawn on the canvas that must
**not** be copied as data until the owner supplies them.

> **Limitation.** This pass inventoried the canvases from their markup and text, and read
> the 23 Sep parity matrix. It did not repeat pixel-level visual diffs. Phase P2 (issue
> #26) and phase P3 own screenshot-against-artboard comparison. Nothing here is
> **device-verified**: no handset has been attached for any of this work.

---

## Mobile app (design-canvas, 23)

| Artboard | Route (mobile) | Visual | Function | Gaps | Blocked values on canvas |
|---|---|---|---|---|---|
| Splash | `(auth)/sign-in` | VV | VERIFIED | Terms and Privacy links are plain text and not tappable (DEAD) | — |
| Otp | `(auth)/sign-in` (step 2) | VV | VERIFIED (code) | Real SMS delivery unverified (ISS-089) | — |
| RoleSelect | `role-select` | VV | VERIFIED | — | — |
| Serviceability | `serviceability` | SRC | VERIFIED (code) | Location-first flow is on this branch and needs a device check. Delivery terms rows are BLOCKED | "60 min", "Tomorrow, 8 AM", seasonal notice, COD ceiling |
| HomeFirstRun | `(tabs)/index` | VV | PARTIAL | Bell routes to Orders (no notification model). "Add materials" has no saved-list model. Category tiles lead mostly to `coming_soon` | "Popular in Srinagar" ranking |
| HomeHomeowner | `(tabs)/index` | SRC | PARTIAL | Shop by room has 0 rooms. Estimator BLOCKED | — |
| Categories | `(tabs)/categories` | SRC | IMPROVE | Draws 4 groups and 21 categories. Live data has 5 groups and 23 categories, 19 of them empty. 3 tools categories have no tile | Per-category counts drawn ("23 products") |
| Subcategory | `category/[slug]` | SRC | PARTIAL | "Shop by grade" needs CAT-03 (no model). "Brands we stock" is LIVE | Grade counts, ₹465/₹495, "Tomorrow, 8 AM" |
| ListingGrid | `products` (grid view) | SRC | IMPROVE | Size, Finish and Room facets need attributes. Pagination and back-position (CLG-03) | 6% off, delivery chips |
| ListingRows | `products` (row view) | SRC | IMPROVE | As above. "Notify me" not built | Compare-at prices |
| SearchEntry | `search` | VV | PARTIAL | Trending chips BLOCKED (ISS-060). Recents and brands LIVE | Trending terms list |
| SearchResults | `search` | VV | PARTIAL | Brand facets and sort LIVE. Category facet counts ABSENT | — |
| SearchEmpty | `search` | SRC | PARTIAL | "Request this item" BLOCKED. "Browse <category>" goes to all categories | — |
| ProductDetail | `product/[slug]` | SRC | PARTIAL | Catalogue mode needs the `catalogue-mode-app` branch merged (GAP-M-01). Bulk tiers not shown | ₹ price, stock "240 bags", ETA, estimator ratio |
| ProductVerify | `product/[slug]` (section) | — | BLOCKED | No batch/genuineness model | Batch code, packing date |
| Cart | `(tabs)/cart` | SRC | VERIFIED (code) | Coupon entry and Save as list missing in the app. Must be hidden in catalogue mode | Speed chips |
| Slots | — | — | BLOCKED | No `Slot` model (ISS-057) | Dates and windows |
| Payment | `checkout` | SRC | PARTIAL | Razorpay test only. Live keys BLOCKED | UPI app chips (owner 7.2) |
| OrderPlaced | `order-placed/[orderNo]` | SRC | VERIFIED (code) | ETA copy must stay honest | "60 min" |
| Orders | `(tabs)/orders`, `orders/[orderNo]` | SRC | VERIFIED (code) | Arrival clock BLOCKED | "by 2:40 PM" |
| Tracking | `orders/[orderNo]` | SRC | PARTIAL | `promisedAt` is null until slots exist. Scan-on-arrival not built | Shipment ETA |
| Wallet | `wallet` | SRC | PARTIAL | Wallet LIVE. Credit line BLOCKED/DEFERRED | ₹1,20,000 credit |
| Account | `(tabs)/account`, `profile`, `business` | VV | PARTIAL | Notifications, Help, WhatsApp, Terms, Privacy and Returns rows missing or blocked. Contractor chip ABSENT | Sample GSTIN |

**Mobile screens not on any artboard:** `driver/index` and `driver/[shipmentId]` (delivery
partner mode, which corresponds to the ops `Delivery` artboard), `wishlist` and
`room/[slug]`.

## Web (web-canvas, 21)

| Artboard | Route (web) | Visual | Function | Gaps | Blocked values on canvas |
|---|---|---|---|---|---|
| MobileHome | `/` (mobile composition) | VV | IMPROVE | CTAs lead to empty categories. All 27 images load eagerly. Tiles have empty alt. Greeting has no name | "₹34,213" cart total, offers |
| (Main) desktop home | `/` (desktop) | VV | IMPROVE | Same CTA problem. Deals strip copy fixed | Deal prices and dates |
| Categories | `/categories` | VV (23 Sep) | IMPROVE | The canvas says "21 categories in four groups". Live has 23 in 5. 19 are `coming_soon` | Per-category product counts |
| CategoryLanding | `/category/[slug]` | VV (23 Sep) | PARTIAL | "Shop by grade" (L3) missing. Empty categories render the agreed empty state. Delivery line BLOCKED | Grade counts with IS codes, ₹ prices, "Tomorrow, 8 AM" |
| ListingGrid | `/category/[slug]` (grid) | SRC | IMPROVE | Facets drawn: Brand, Size, Finish, Room, Delivery speed. Only Brand (and price) are real. 24-item first page and back-reset (CLG-03) | Facet counts, speed counts |
| ListingRows | `/category/[slug]` (rows) | SRC | IMPROVE | As above | — |
| MobilePlp | `/category/[slug]` at 380 px | SRC | IMPROVE | Filter sheet: price controls shown where nothing is priced (the 3 Nov local fix cannot be located; P2) | — |
| SearchResults | `/search` | VV | PARTIAL | Sort fixed 23 Sep. No typo tolerance | — |
| ProductDetail | `/product/[slug]` | SRC | PARTIAL | Catalogue mode shows "Price on request" and the enquiry form. Estimator, stock and batch BLOCKED | ₹465, "240 bags", "1:6 mix", batch code |
| MobilePdp | `/product/[slug]` at 380 px | SRC | IMPROVE | Sticky bar shows "Price on request" **with no action** [S] | — |
| ProductVerify | (PDP section) | — | BLOCKED | No model | — |
| Cart | `/cart` | SRC | VERIFIED (code) | Closed in catalogue mode | — |
| Checkout | `/checkout` | SRC | PARTIAL | Live payments BLOCKED. Slots BLOCKED | Fees, slots |
| MobileCheckout | `/checkout` at 380 px | SRC | PARTIAL | ISS-073 and ISS-081 fixed | — |
| Confirmation | `/checkout/confirmation/[orderNo]` | SRC | VERIFIED (code) | — | — |
| Account | `/account/*` (10 routes) | — | PARTIAL | Not rendered live (needs a real sign-in) | — |
| Wallet | `/account/wallet` | — | PARTIAL | Credit BLOCKED | Credit line |
| Downloads | `/downloads` | VV | VERIFIED | Everything honestly "Not published" | Brand catalogue PDFs |
| Faq | `/faq` | VV | VERIFIED | Copy corrected 23 Sep | — |
| HowWeWork | `/how-we-work` | VV | VERIFIED | — | — |
| Legal | `/terms`, `/privacy`, `/refunds`, `/shipping` | VV | BLOCKED | Legal entity, address and return window (ISS-017) | — |
| Services | `/services` | SRC | BLOCKED | ISS-067: unverified claims | "background-checked" and similar |

## Ops console (ops-canvas, 24)

| Artboard | Route (admin) | Visual | Function | Gaps |
|---|---|---|---|---|
| SignIn | `/login` + allowlist | SRC | IMPROVE | Admin access is an environment allowlist (ISS-027) |
| Orders | `/admin/orders` (+ CSV export) | SRC | VERIFIED (code) | — |
| OrderDetail | `/admin/orders/[orderNo]` | SRC | PARTIAL | Transition rules and audit (ISS-014, ISS-015) need re-checking |
| Products | `/admin/products` | SRC | VERIFIED (code) | Search, filter and paging are in the RC. PR #6 is stale |
| ProductEditor | `/admin/products/[slug]`, `/admin/listing` | SRC | PARTIAL | Panels for details, variants and photos are in the RC. Inline brand/category create (issue #7) is open |
| Inventory | `/admin/inventory` | SRC | PARTIAL | Opening stock BLOCKED (OWNER 5.3). Ledger audit is in the RC |
| StockLedger | `/admin/stock-ledger` | SRC | PARTIAL | As above |
| Purchasing | `/admin/purchasing` | SRC | PARTIAL | No cost price (ISS-062) |
| Suppliers | `/admin/suppliers` | SRC | PARTIAL | Supplier data is the owner's |
| PickPack | `/admin/shipments/[id]/packing-slip` | SRC | VERIFIED (code) | — |
| Dispatch | `/admin/dispatch`, `/admin/drivers` | SRC | VERIFIED (code) | Driver roster is owner data |
| Delivery (driver phone screen) | mobile `driver/*` | — | PARTIAL | COD collection BLOCKED |
| CodReconciliation | `/admin/cod-cash` | SRC | BLOCKED | COD is off. Roles are owner input |
| Payments | `/admin/payments` | SRC | PARTIAL | Webhook lag view needs an event-log model |
| Returns | `/admin/returns/*` | SRC | PARTIAL | Return policy BLOCKED |
| Invoices | `/admin/invoices` | SRC | BLOCKED | GSTIN, HSN and invoice format (CA) |
| Coupons | `/admin/coupons` | SRC | VERIFIED (code) | — |
| Customers / CustomerDetail | `/admin/customers/*` | SRC | PARTIAL | Segment thresholds are owner input |
| CreditLedger | `/admin/credit` | SRC | DEFERRED | No credit product |
| Serviceability | `/admin/serviceability` | SRC | VERIFIED (code) | Pincode data is owner input |
| Staff | `/admin/staff` | SRC | MISSING (RBAC) | ISS-027 |
| Support | `/admin/support` | SRC | MISSING | No ticket model. The page says so |
| Reports | `/admin/bi` | SRC | PARTIAL | Must not show fabricated funnels (ISS-065 fixed) |

**Admin routes with no artboard:** `/admin/catalogue-approvals`, `/admin/categories`,
`/admin/brands`, `/admin/enquiries`, `/admin/bookings`, `/admin/settings`. These were
added for catalogue safety and catalogue mode. They should be given artboards, or their
design should be agreed to inherit from `ProductEditor`.
