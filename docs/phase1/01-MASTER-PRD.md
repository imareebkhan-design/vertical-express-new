# A. Master PRD: Vertical Express

**Version:** Phase 1 draft for owner review · **Date:** 3 Nov 2026 · **Status:** awaiting owner approval
**Evidence tags:** [C] code · [L] live probe · [D] documented, not re-verified · [S] staging observation (see `README.md`)

---

## 1. Product summary

Vertical Express sells construction materials in **Srinagar** for delivery to a customer's
site. Customers are homeowners partway through a build or renovation, and contractors. It
has three surfaces on one backend:

1. **Customer website**: Next.js 15 App Router, at `www.verticalexpress.in`
2. **Customer mobile app**: Expo SDK 57 / React Native 0.86 (`mobile/`, workspace repo), which also contains the **delivery-partner (driver) mode**
3. **Operations console**: `/admin/*` in the same Next.js app

**Today's operating state:** production is live in **catalogue/enquiry mode**
(`COMMERCE_MODE=catalogue`). Customers can browse 260 approved products and send an
enquiry. Nothing can be bought: no price, stock figure, GST rate or delivery promise is shown
[L]. The site stays in this mode until the gates in `07-PRODUCTION-READINESS.md` are met.

### Design authorities (in order)

| Concern | Authority |
|---|---|
| Visual design | The three canvases (`design-canvas/`, `web-canvas/`, `ops-canvas/`): **static mockups with no logic** (`DCLogic` is defined nowhere) |
| Functional reference for taxonomy, category organisation and product structure | HomeRun, used for **patterns only**. No code, branding, copy or assets. Images only under the licence position in `04-ASSET-INVENTORY.md` |
| UX quality bar (speed, clarity, honest empty states, one-handed use) | Swiggy, used as a benchmark only, never copied |
| Business values (price, GST, stock, delivery time, COD, returns) | **The owner only.** Values drawn on the canvases (₹465, "Tomorrow, 8 AM", "240 bags", "60 min") are illustrations, **not data** |

### Users

| Persona | Need | Primary surface |
|---|---|---|
| Homeowner (e.g. "Iqra, Rajbagh House") | Find the right material by room or job, trust the price, get it delivered to the site | Mobile app, mobile web |
| Contractor (e.g. "Bilal, Hyderpora Site") | Reorder fast, buy in bulk at quantity prices, manage several sites | Mobile app |
| Ops staff | Approve the catalogue, receive and dispatch orders, reconcile cash | Ops console (desktop) |
| Delivery partner | See assigned deliveries, navigate, prove delivery, collect cash | Mobile app, driver mode |

### Goals for the next release (owner to confirm)

1. **G1. Browsing that feels finished:** every category a customer can see leads somewhere true. Issue #26.
2. **G2. A catalogue fit for sale:** verified MRP, selling price, SKU, GST/HSN, stock and approved photo for each product meant to be sold.
3. **G3. A transactional launch:** priced checkout, Razorpay live, delivery and COD under owner-set policy, legal pages.
4. **G4. Operational closure:** dispatch, driver POD, COD reconciliation and refunds running daily without engineering help.

### Non-goals (deliberately deferred)

Multi-city expansion, Redis or a search engine, PostGIS, microservices, a live GPS map for
customers, route optimisation, reviews, loyalty, credit terms, a cost calculator before P1,
and full WhatsApp Business API (a `wa.me` link covers the need). See `CLAUDE.md` "Do Not
Build Yet" and `DECISIONS.md`.

---

## 2. Requirement status legend

| Status | Meaning |
|---|---|
| **VERIFIED** | Already implemented and verified (live probe, recorded staging evidence, or test plus live) |
| **IMPROVE** | Implemented, but needs improvement |
| **PARTIAL** | Partially implemented |
| **MISSING** | Not built |
| **BLOCKED** | Blocked by business data or an owner decision (the code may be ready) |
| **DEFERRED** | Deliberately deferred by recorded decision |

---

## 3. Requirements by domain

### 3.1 Customer website

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| WEB-01 | Home (desktop and mobile web compositions) with search, location, category entry and merchandising | IMPROVE | [C][S] Home CTAs "Shop tiling" and "Shop electricals" lead to empty `coming_soon` categories. Tiles are hard-coded by slug in `lib/merchandising/home.ts`. A local fix (`claude/category-navigation-slice`) hides those banners but is uncommitted |
| WEB-02 | Every public route returns 200 or a correct redirect, and an unknown product returns 404 | VERIFIED | [L] `/category/cement` 200, unknown PDP 404. Apex 301 → www |
| WEB-03 | Content pages: contact, FAQ, terms, privacy, refunds, shipping, how-we-work, downloads | PARTIAL | [C] All 8 routes exist. Legal content is BLOCKED on owner and legal input (ISS-017): legal entity, address, phone, return window |
| WEB-04 | Canonical host, sitemap, robots, OG tags use `www.verticalexpress.in` | PARTIAL | [D] ISS-018 is OPEN. Production sets `NEXT_PUBLIC_SITE_URL` (PR #25). Needs a live check |
| WEB-05 | Greeting uses the customer's name when signed in (mobile web) | MISSING | [D] Parity matrix: "GAP, not fixed" |
| WEB-06 | Services area (architects, contractors…) | BLOCKED | [D] ISS-067: owner decision on whether services launch and which claims are true |
| WEB-07 | Security headers and CSP | VERIFIED | [D] ISS-022 FIXED. CSP is not nonce-based, by owner decision |

### 3.2 Customer mobile app (Expo)

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| MOB-01 | Tabs: Home, Categories, Cart, Orders, Account. Stack: category, products, product, search, checkout, order, serviceability, wallet, wishlist, room, role-select, business, profile | VERIFIED (code) | [C] `mobile/src/app/**` (26 route files). Nothing is **device-verified**: no handset has been attached for any of this work [D] |
| MOB-02 | The app honours catalogue mode (no add to cart, enquiry instead, ORDERING_CLOSED treated as a final refusal) | **PARTIAL** | [C] Built on workspace branch `claude/catalogue-mode-app` (`3291d72`). **Missing from the current mobile branch** `claude/location-first-address`. A build cut from the current branch would offer a cart that production refuses |
| MOB-03 | Location-first serviceability: GPS, map pin and pincode, with sites saved with a pin | VERIFIED (code + screen tests) | [C] Commits `f82d825`, `2eeff34`, `36d8fb8`. Screen tests exist. Not device-verified |
| MOB-04 | Store distribution (Play / App Store) | MISSING | [D] Version 1.0.0. The store badges on the web point to `#` (OWNER 9.7) |
| MOB-05 | First-run vs returning home (`Profile.onboardedAt`) | VERIFIED | [D] Parity matrix: "implemented and verified on staging" |
| MOB-06 | Skeleton loading states on listings | MISSING | [D] Not drawn on the canvas either (the `.sk` class is a strikethrough price, not a skeleton) |

### 3.3 Categories and subcategories (overlaps issue #26)

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| CAT-01 | Level 1: four department groups (Civil & Interiors, Furniture & Hardware, Electrical, Plumbing & Bath), as drawn | IMPROVE | [L] Production returns **5** display groups: a `tools_equipment` group holds the only stocked categories (power tools 202, outdoor/agri 39, spare parts 15). The canvas draws 4 groups and 21 categories. **Owner decision D-01** |
| CAT-02 | Level 2: categories with name, tile image, product count and availability state | IMPROVE | [L] 23 categories. **19 are `coming_soon` with 0 products**. Only `general-hardware-tools` (4) among the original 20 has stock. The 3 populated tools categories have **no tile image** (`imageUrl` null) |
| CAT-03 | Level 3: "Shop by grade/type" subcategory (canvas: PPC / OPC 43 / OPC 53 / PSC / White / Ready-mix, with counts) | MISSING | [C] `Category` is flat (no `parentId`). Products carry free-form `attributes`/`specs`. There are no structured facet keys, and the API has no spec facets |
| CAT-04 | An empty category never 404s from live navigation and offers a truthful next step (enquire, nearest stocked category) | PARTIAL | [C][L] Returns 200 with an empty state and sibling categories (owner decision 12 Oct). Whether the "next action" is helpful is under #26 |
| CAT-05 | Category order, launch set and naming are owner-confirmed (e.g. `fevicol` holds no Fevicol products) | BLOCKED | OWNER 3.1, ISS-007 |
| CAT-06 | Shop by room (Room/RoomCategory) | BLOCKED | [D] Model, API and both UIs are built. 0 rooms are curated (OWNER parity decision #5) |
| CAT-07 | Category admin: create, edit and retire, with an image | PARTIAL | [D] `/admin/categories` is in the RC [C]. `feat/admin-catalogue` (category edit, photo upload) is merged into the RC [C]. Issue #7's inline create from the product form is still open |

### 3.4 Catalogue, search, filter and sort

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| CLG-01 | Public visibility needs approved identity, approved photo with attested licence (in production), active brand and category, and a status of `catalog_only` or `published` | VERIFIED | [C] `lib/catalog-policy.ts` `publicProductWhere()`. [L] 260 visible in production, 261 on staging. PR #25 says 3 are hidden pending photo review [D] |
| CLG-02 | Sellable needs `published`, owner commercial review, a priced default variant (>0) and stock rows in an active warehouse | VERIFIED (code) | [C] `catalogListingWhere()`. DB triggers clear approval when a product is edited [D] |
| CLG-03 | Listing pagination is reliable and keeps scroll position on back | IMPROVE | [S] Power tools rendered 24 of 202, infinite scroll reached 120 after six scrolls, and back from a PDP reset the list to the top. The API reads `perPage` and ignores `limit` (`limit` is capped at 20) |
| CLG-04 | Sort: relevance, popular, newest, price, discount | IMPROVE | [S] Price sort and price filters **visibly do nothing** on a catalogue with no prices. A local fix hides price controls when nothing is priced (uncommitted). "Popular" was removed because there is no rating data. ISS-058: the default sort needs a decision |
| CLG-05 | Facets: brand (with counts), category (search) | PARTIAL | [D] Brand facets are live. Size, finish, room, grade and delivery-speed facets (drawn) need structured attributes (CAT-03) |
| CLG-06 | Search: debounced, suggest, brand shortcuts, closest match, empty state | PARTIAL | [C] `/api/search/suggest`, `/api/v1/search/closest`, synonyms model. No typo tolerance (ISS-020, `pg_trgm` not used) |
| CLG-07 | "Searched most in Srinagar" trending chips | BLOCKED | ISS-060: logging search queries needs a data-retention decision |
| CLG-08 | "Request this item" from empty search | BLOCKED | Owner process decision: who receives the request |
| CLG-09 | Catalogue import: CSV dry run → apply, with SKU, MRP, price and variant validation | PARTIAL | [D] The importer exists. The 2 Nov dry run of 996 rows found **996 invalid** (MRP and price blank on all 996, SKU blank on 976). Update-import work is on the unpushed `claude/catalogue-update-import` |
| CLG-10 | Every product has a verified MRP, selling price, SKU, HSN/GST, pack/UoM and weight | **BLOCKED** | OWNER 2.2, 2.3, 3.7, 3.8, 4.1. **No MRP is verified for any product** |

### 3.5 Product detail page (PDP)

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| PDP-01 | Title, brand, unit, specs, image gallery, breadcrumbs | IMPROVE | [C] Product pages exist on web and mobile. Most products have a single image, so the gallery is limited by content |
| PDP-02 | Catalogue mode shows "Price on request" and an enquiry form; no add to cart | VERIFIED (web) / PARTIAL (mobile) | [L][D] PR #25 confirms the enquiry on production. [S] The sticky bottom bar on mobile web shows "Price on request" **with no control**: a dead end on a phone |
| PDP-03 | Variant selector, quantity stepper, bulk-tier pricing display | PARTIAL | [D] Variants and stepper are present. Bulk tiers are in the data but not shown in the mobile UI. All BLOCKED for selling until prices exist |
| PDP-04 | Stock figure with warehouse ("240 bags at Srinagar Central") | BLOCKED | OWNER 5.1–5.4. The API exposes only `inStock` |
| PDP-05 | "How many bags?" estimator | DEFERRED / BLOCKED | P1. Needs owner-approved coverage ratios |
| PDP-06 | Delivery promise line ("Tomorrow, 8 AM") | BLOCKED | ISS-057 slots and OWNER 6.3. Today it shows honest copy for heavy items ("by truck") |
| PDP-07 | Genuineness / batch verification (ProductVerify artboard) | BLOCKED | Owner operations decision. No model exists |
| PDP-08 | "Also bought with this" | DEFERRED | No order history to base it on |

### 3.6 Cart and checkout

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| CHK-01 | Server-authoritative cart: no price stored, stock check on add, guest cart merged at sign-in | VERIFIED (code) | [C] ISS-016 and ISS-083 FIXED. Integrity behaviours preserved per `CLAUDE.md` |
| CHK-02 | Cart and order APIs refuse in catalogue mode (403 ORDERING_CLOSED, `orderingOpen`) | VERIFIED (code) | [C] `lib/commerce-mode.ts`, `lib/api/response.ts` |
| CHK-03 | Shipment split: bulk (truck) vs parcel | VERIFIED (code) | [C] `planShipments`, by `Category.isBulk` |
| CHK-04 | Location-first address with map pin; city and state from pincode, editable | PARTIAL | [C] Web is in the RC. ISS-096 fix is in the RC [C]. Mobile work is in progress (this branch) |
| CHK-05 | Coupons: validation, limits, redemption | IMPROVE | [D] Engine live (ISS-011, ISS-066, ISS-079 fixed). Coupon `FIRST3` does nothing as configured (owner decision) |
| CHK-06 | Delivery slots | BLOCKED | ISS-057: no `Slot` model, owner operating policy needed |
| CHK-07 | Express delivery option | BLOCKED | Mechanics built (ISS-082). Fee and ETA are unset, not approved for production |
| CHK-08 | Delivery fee and free-delivery threshold | BLOCKED | OWNER 6.4 and 6.5. The ₹500 threshold is a guess |
| CHK-09 | "Save as list" / named project lists | BLOCKED | Owner scope decision. The flat wishlist is built |

### 3.7 Payments and order management

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| PAY-01 | Razorpay order, signature verification, webhook as source of truth, amount check, dedupe, refund finality | VERIFIED (code + tests) | [C][D] ISS-002, 003, 005, 074–077, 085 and the refund replay fix. Verified on Razorpay **test** keys only |
| PAY-02 | Production refuses dummy or test gateways; catalogue mode has no payment variables | VERIFIED (code) | [C] `assertPaymentConfig`, ISS-087. `apphosting.production.yaml` (PR #25) has no payment variable [D] |
| PAY-03 | Razorpay **live** merchant account and keys | BLOCKED | OWNER 7.1. Needs GSTIN, PAN and bank proof |
| PAY-04 | COD with value caps, first-order cap, collection and reconciliation | PARTIAL / BLOCKED | [C] `/admin/cod-cash` exists. COD is switched off (ISS-063). Caps and roles are OWNER 7.3–7.7 |
| PAY-05 | Order state machine, audit log, status events | PARTIAL | [D] ISS-014 and ISS-015 are OPEN in the register. `AuditLog` and `OrderStatusEvent` models exist [C], so the register needs re-checking |
| PAY-06 | Refunds: owed money done; policy refunds and returns | PARTIAL / BLOCKED | ISS-025 partial. Return window is OWNER 8.1 and 8.2. Admin returns routes exist [C] |
| PAY-07 | GST tax invoice (format, GSTIN, HSN) | BLOCKED | ISS-026 needs a CA. The invoice route exists [C], but the seller's GSTIN is unknown. ISS-086: cement is taxed at 28% when it should be 18%, an owner/CA decision |
| PAY-08 | One confirmation email per order, with retries | PARTIAL | [D] The outbox is in the RC [C]. Notifications that report "sent" without sending were fixed (ISS-088) |

### 3.8 Delivery and tracking

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| DEL-01 | Serviceability by pincode with fee and ETA from `ServiceablePincode` | VERIFIED (code) / BLOCKED (data) | [C] Launch pincodes, fees and ETAs are OWNER 6.1–6.6 |
| DEL-02 | Shipment lifecycle: pending → packed → out → delivered, packing slip | VERIFIED (code) | [D] ISS-009 progress, 5 Sep. `/admin/dispatch` and the packing slip exist [C] |
| DEL-03 | Customer tracking page: honest ETA (`promisedAt` or "not scheduled yet"), delivery code | VERIFIED (code) | [C] Web delivery code merged (#21). Tracking API exists |
| DEL-04 | Live driver location shown to the customer | PARTIAL / DEFERRED | [C] Driver location endpoints and `ShipmentLiveLocation` exist. `CLAUDE.md` defers live GPS. Driver operating model is owner decision #15 |
| DEL-05 | Seasonal/winter notices and slot policy | BLOCKED | Owner |

### 3.9 Customer accounts

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| ACC-01 | Firebase phone OTP and Google sign-in, server-verified session cookie | VERIFIED (code) / IMPROVE | [D] Real SMS delivery is unverified (ISS-006, ISS-089). OTP abuse protection is partial (ISS-047). Production Firebase environment variables are ISS-053 (OPEN, owner action) |
| ACC-02 | Sites (addresses) with pin, access note, default | VERIFIED (code) | [C] Web and mobile |
| ACC-03 | Orders list, filters, reorder at today's prices | VERIFIED (code) | [C] |
| ACC-04 | Wallet balance | VERIFIED (code) | [C] Cashback is off by default (ISS-055), rate set by the owner |
| ACC-05 | Wishlist / saved products | VERIFIED (code) | [C] |
| ACC-06 | Buyer type (role), business and GSTIN capture | VERIFIED (code) | [C] `role-select`, `business` |
| ACC-07 | Notifications centre, help/support, WhatsApp, Terms/Privacy links in the app | MISSING / BLOCKED | No `Notification` model. The WhatsApp number is an owner input |
| ACC-08 | Vertical Credit (trade credit line) | DEFERRED / BLOCKED | Owner. No model |

### 3.10 Admin / ops console

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| OPS-01 | 32 admin pages covering orders, products, approvals, categories, brands, inventory, stock ledger, dispatch, drivers, COD cash, payments, returns, coupons, customers, enquiries, serviceability, settings, staff, suppliers, purchasing, invoices, credit, support, BI | PARTIAL | [C] Routes exist. [D] Parity matrix: "source-audited 27/27, none rendered live". Several pages honestly state there is no data model behind them (support, credit, invoices) |
| OPS-02 | Catalogue approval: identity, photo and commercial review, with specs visible | VERIFIED (code) | [C] ISS-095 fix is in the RC (`feat/admin-catalogue` merged). Not rendered live with an admin login |
| OPS-03 | Product media upload with review gate | PARTIAL | [C] `/api/admin/product-images` exists. Hosting needs `roles/storage.objectCreator` [D]. **Production reads the staging bucket** (PR #25) |
| OPS-04 | Role-based access (beyond an environment allowlist) | MISSING | ISS-027 OPEN. Roles are OWNER 10.8 |
| OPS-05 | Enquiry inbox with status | VERIFIED (code) | [C] `/admin/enquiries`, `enquiry-status.tsx` |
| OPS-06 | Bulk catalogue update import (MRP/price/SKU) | PARTIAL | Unpushed `claude/catalogue-update-import` |

### 3.11 Mobile driver workflows

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| DRV-01 | Driver mode reachable only by a rostered phone number; list of assigned shipments | VERIFIED (code) | [C] `mobile/src/screens/driver/*`, `/api/v1/driver/shipments` |
| DRV-02 | Start delivery, share location while in transit, deliver with code (POD) | PARTIAL | [C] `start`, `location` and `deliver` endpoints and the delivery screen exist. Not device-verified |
| DRV-03 | COD collection at the door and hand-over | BLOCKED | COD is off. OWNER 7.6 and 7.7 |
| DRV-04 | Failed delivery and reattempt | MISSING | OWNER 10.6 |
| DRV-05 | Navigate / call customer | PARTIAL | Check against the ops `Delivery` artboard in Phase 2 |

### 3.12 Error, loading and empty states

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| UXS-01 | Every list has loading, error with retry, and an honest empty state | PARTIAL | [C] Mobile `Loading/ErrorState/EmptyState` primitives are used widely. Web is mixed. No skeletons |
| UXS-02 | No control that does nothing (dead CTAs, banners to empty categories, price sort with no prices, PDP bar without an action) | IMPROVE | [S] Three live examples: WEB-01, CLG-04, PDP-02 |
| UXS-03 | Slow-network recovery (mid-tier Android, degrading 4G) | MISSING (untested) | No throttled-network test exists |

### 3.13 Performance and accessibility

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| PERF-01 | Home LCP ≤ 2.5 s on a Moto G-class device over 4G; listing JS kept small | IMPROVE | [S] The staging home loads **all 27 images** at 393 px width, without lazy loading below the fold. `docs/release/v1.1-performance-report.md` [D] is a prior baseline |
| A11Y-01 | Meaningful `alt` on category tiles and product images | IMPROVE | [S] Category tiles have **empty alt text** |
| A11Y-02 | Keyboard and screen-reader navigation of category → listing → PDP, focus order, touch targets ≥ 44 px | PARTIAL (untested) | No automated a11y test exists. Amber body text contrast is ISS-039 (OPEN) |

### 3.14 Security and production deployment

| ID | Requirement | Status | Evidence / note |
|---|---|---|---|
| SEC-01 | Secrets in Secret Manager; no credentials in the repo | VERIFIED (process) | [D] PR #25 |
| SEC-02 | Rate limits fail closed on OTP; atomic; rows reclaimed | VERIFIED (code) | ISS-021, 041, 042 |
| SEC-03 | Cron endpoint authenticated | VERIFIED | [D] 401 without the secret (PR #25) |
| SEC-04 | Admin RBAC and audit trail | MISSING / PARTIAL | ISS-027, ISS-015 |
| SEC-05 | Dependency patching (Next 15.5.28 RCE fix, runtime deps) | VERIFIED (code) | [C] RC `package.json`: next 15.5.28, zod 4.6.7, @sentry/nextjs 10.78. The owner's local checkout on `claude/location-first-address` is still on 15.5.23 |
| OPS-DEP-01 | Firebase App Hosting: staging and production backends, environment split, manual migrations | VERIFIED (deployed) | [L] Both healthy. PR #25 is still **draft**, so production was deployed from an unmerged branch |
| OPS-DEP-02 | Production photo bucket separate from staging | MISSING | PR #25 "Not done" |
| OPS-DEP-03 | Monitoring: Sentry, uptime, alerting | PARTIAL | [C] Sentry configs are present. ISS-012 partial. Uptime alerting is unconfirmed |
| OPS-DEP-04 | Backups and rollback runbook | PARTIAL | [D] `pg_dump` taken before the production copy. `docs/release/v1.1-rollback-plan.md` exists. No restore drill is recorded |

---

## 4. Cross-cutting rules (binding on every phase)

1. **Never invent** a price, MRP, stock figure, GST/HSN rate, spec, delivery time, COD limit, return window or licence permission. The canvases' numbers are placeholders.
2. Production stays `COMMERCE_MODE=catalogue` until **every** gate in `07` is met and the owner signs.
3. A customer must never see a control that does nothing, or an offer that cannot be honoured.
4. Images reach customers only through the approval gate (`approvedImageWhere`) with an attested licence code. See `04`.
5. Smallest safe change. Feature branch, PR, CI green, staging verified with screenshots, then owner approval. Nothing goes to `main` or production without the owner.

## 5. Open product questions (summary; full list in `07` §4)

D-01 taxonomy (4 groups vs 5) · D-02 subcategory model · D-03 HomeRun licence instrument ·
D-04 launch categories · D-05 pricing (GST-inclusive?) · D-06 delivery policy · D-07 COD ·
D-08 returns · D-09 legal identity · D-10 driver model · D-11 merge order of in-flight branches.
