# Vertical Express — Product Requirements Document (PRD)

> Phase 1 deliverable. Source material: full teardown of the reference site (home-run.co — homepage, collection pages, nav, cart affordances) and the current Vertical Express frontend (vertical-express.vercel.app). Items that could not be observed directly on the reference are marked **[inferred]**.

---

## 1. Vision

Vertical Express is a **construction commerce platform**, not a storefront. One account, one cart, one project view for: buying materials (60-min delivery), hiring professionals, booking labour, requesting quotations, and (future) managing entire construction projects with invoices and deliveries.

**Primary personas**

| Persona | Goal | Key flows |
| --- | --- | --- |
| Site engineer / contractor | Restock materials fast, bulk pricing, GST invoices | Search → PLP → bulk add → checkout → reorder |
| Homeowner (renovating) | Guided buying + hire trusted professionals | Category browse → PDP → cart; Services → booking → quote |
| Homeowner (building) | End-to-end construction package | Services → consultation → project (future) |
| Vendor / brand partner (future) | List products, manage inventory | Vendor portal |
| Ops / admin | Catalog, orders, bookings, content | Admin dashboard |

---

## 2. Website Architecture

```
PUBLIC                          AUTHENTICATED                  ADMIN (separate area)
/                               /account (dashboard)           /admin
/categories                     /account/orders                /admin/products
/category/[slug]   (PLP)        /account/orders/[id]           /admin/orders
/product/[slug]    (PDP)        /account/addresses             /admin/categories
/search?q=…                     /account/wishlist              /admin/bookings
/cart                           /account/quotes                /admin/quotes
/checkout          (guarded)    /account/bookings              /admin/customers
/checkout/confirmation/[id]     /account/profile               /admin/coupons
/services                                                      /admin/banners
/services/[slug]                                               /admin/cms (blogs, FAQs)
/quote             (request)                                   /admin/settings
/login  /register  /verify
/about  /contact  /faq  /policies/[slug]  /blog  /blog/[slug]
```

Rendering strategy: public catalog pages are static/ISR; cart, checkout, and account are dynamic; admin is fully dynamic behind role checks.

## 3. Navigation Map

**Desktop header (3 strata, matches current build)**
1. Announcement bar — rotating operational messages (hours, free-delivery offer, city, speed).
2. Utility row — logo · search bar (typeahead) · pincode/deliverability chip · Login/Account · Cart (badge).
3. Primary nav — Materials (dropdown: category groups) · Services (dropdown: top services) · About · Contact.

**Mobile** — hamburger drawer (primary nav + category tree), persistent search icon, cart icon; floating "View cart" pill once cart is non-empty; bottom of PDP gets a sticky add-to-cart bar **[inferred]**.

**Footer** — Company links, Policy links, Contact info, newsletter, payment-method icons, copyright.

## 4. Information Architecture

- **Materials taxonomy**: 5 groups → 20 categories → subcategories/filters (brand, type, packaging, price). Reference exposes group pages (e.g. "Civil & Interiors") and leaf collections (e.g. "Cement") with breadcrumbs `Home › Group › Category`.
- **Services taxonomy**: 16 service categories → packages (bundled offerings) → future dedicated service pages with pricing/FAQ/professionals.
- **Content**: blog ("Knowledge Hub"), FAQs, policy pages, price lists.
- Every product belongs to exactly one leaf category and one brand; filterable attributes are data-driven per category (observed on reference: Category, Brand, Type, Packaging, Price slider — each with counts, Reset/Apply).

## 5. Customer Journey (materials)

Discover (SEO/ads/direct) → Homepage (deals, categories, trust) → PLP or Search → PDP → Add to cart (qty, bulk tier) → Floating cart → Cart review → Login/OTP (if guest) → Address + pincode serviceability → Payment (Razorpay / Pay-on-delivery) → Confirmation → Track order → Delivered → Review / Reorder.

## 6. Product Journey

Draft (admin) → Published (indexed, searchable) → In-stock/Low-stock/Out-of-stock states → Price & compare-at & bulk tiers → Deal-of-week flag → Archived. Every state change audit-logged.

## 7. Category Structure

As implemented in `lib/data.ts` (20 categories) plus reference filter dimensions. Category page = PLP scoped to category with hero strip, subcategory chips, filter sidebar, sort, product grid.

## 8. Search Flow

1. Focus search → recent searches + trending categories (typeahead panel).
2. Keystroke (debounced ≥ 250 ms) → suggestions: products (thumb, price), categories, brands. Reference uses a hosted search widget (Wizzy) with facets; we replicate with Postgres FTS → upgrade path to Typesense/Meilisearch.
3. Enter → `/search?q=…` full PLP experience (filters + sort + counts).
4. Zero results → suggest categories, spelling correction, "request this product" CTA.

## 9. Cart Flow

- Line items: product, variant, qty, unit price, applied bulk tier, line total.
- Bulk tiers auto-apply at qty thresholds (reference: 10+/30+/40+ tiers with "unlockable" messaging) with a nudge: "Add N more bags to unlock ₹X/bag".
- Persistent: localStorage for guests, merged into DB cart at login.
- Edit qty inline, remove, save-for-later → wishlist.
- Free-delivery progress meter (orders > ₹500, first 3 orders).
- Empty state: illustration + top categories + deals carousel.

## 10. Checkout Flow

Single page, three collapsible steps (mobile-first):
1. **Contact** — logged in (skip) or phone + OTP inline.
2. **Delivery** — saved addresses radio list + add-new form; pincode serviceability check gates progression; delivery slot estimate ("60 min" vs scheduled).
3. **Payment** — Razorpay (UPI/cards/netbanking) or Pay on Delivery (reference offers PoD); coupon field; order summary always visible (sticky on desktop, accordion on mobile).
Order placed → confirmation page (order id, ETA, items, address, payment status) + email/SMS **[inferred: reference sends Shopify notifications]**.

## 11. Authentication Flow

- **Phone OTP first** (reference uses OTP login with consent checkbox) via Supabase Auth phone provider; email/password as secondary; Google OAuth optional.
- Guest browsing + guest cart always allowed; auth required at checkout, wishlist, account.
- Session: Supabase SSR cookies; middleware guards `/account/*`, `/checkout`, `/admin/*` (admin additionally role-checked).

## 12. Address Flow

CRUD in account + inline at checkout. Fields: label (Home/Site/Office), name, phone, line1, line2, landmark, city, state, pincode, geo (optional), default flag. Pincode validated against `serviceable_pincodes` with ETA per zone.

## 13. Order Flow

States: `pending_payment → confirmed → packed → out_for_delivery → delivered` (+ `cancelled`, `refund_initiated`, `refunded`). Customer sees timeline on order page; cancellation allowed until `packed`. Reorder = copy items to cart.

## 14. Payment Flow

Razorpay Orders API: create order server-side → client checkout modal → signature verification server-side → webhook reconciliation (idempotent). PoD orders skip gateway, flagged for collection. Refunds via Razorpay + status mirror. Every gateway event stored in `payments` + `audit_logs`.

## 15. Vendor Flow (future milestone)

Vendor onboarding → KYC → product submissions (draft) → admin approval → inventory sync per warehouse → payout statements. Data model reserves `vendor_id` on products/inventory now to avoid migration pain.

## 16. Admin Flow

Role-gated dashboard: KPIs (orders today, GMV, AOV, low stock), order management (state transitions, refunds), catalog CRUD (products, variants, images, bulk CSV import), category/brand management, coupon builder, booking & quote queues with assignment, CMS (banners, blogs, FAQs), customer lookup, settings (pincodes, delivery fees, announcement bar).

## 17. Service Booking Flow

Services page → service card → booking form (service, property type, area/scope, address, preferred date, notes) → booking created (`received`) → ops assigns professional (`scheduled`) → site visit → quote issued → accepted → project execution states. Customer tracks in `/account/bookings`.

## 18. Quote Request Flow

Bulk/RFQ path for contractors: cart → "Request quote" or standalone `/quote` (upload BOQ, line items, delivery pincode, target date). States: `submitted → priced → accepted/declined → converted_to_order`. Admin prices line-by-line; customer accepts → prefilled checkout.

## 19–22. States

- **Error states**: page-level error boundary (branded, retry CTA); form field errors inline (zod messages); payment failure → order stays `pending_payment` with retry; 404 with search + top categories; serviceability failure blocks checkout with waitlist capture.
- **Loading states**: route-level `loading.tsx` skeletons matching card geometry (PLP grid, PDP gallery, account lists); button spinners on all mutations; optimistic cart updates with rollback.
- **Empty states**: cart, wishlist, orders, search-zero, bookings — each with illustration (brand icon set), one-line copy, and a single primary CTA.
- **Notifications**: in-app toast system (add-to-cart, wishlist, errors); notification center in account (order updates, quote ready); transactional SMS/WhatsApp for OTP + order updates **[reference links WhatsApp support]**; email for receipts.

## 23. Emails

Transactional set: OTP (SMS), order confirmation, payment receipt/invoice (PDF, GST fields), shipping/out-for-delivery, delivered + review ask, refund processed, quote ready, booking confirmed/scheduled, abandoned-cart (marketing, opt-in), newsletter welcome. Provider: Resend (React Email templates).

## 24–25. Mobile & Desktop Experience

Mobile-first: 2-col product grids, snap carousels, drawer nav, sticky PDP action bar, bottom-sheet filters, floating cart pill, 44 px touch targets. Desktop adds: hover dropdowns, 4–6-col grids, sticky order summary, filter sidebar, mega-search panel. Breakpoints follow current Tailwind usage (sm/md/lg).

## 26. SEO

- ISR pages with per-entity `generateMetadata` (title template `%s | Vertical Express`), canonical URLs, OG images.
- Structured data: `Product` (+offers, aggregateRating), `BreadcrumbList`, `Organization`, `FAQPage`, `Service`.
- Clean slugs, `sitemap.xml` + `robots.txt` route handlers, image `alt` everywhere, internal linking (related products, category cross-links).

## 27. Performance

Budgets: LCP < 2.5 s (4G), CLS < 0.1, INP < 200 ms, JS < 300 kB first load on catalog pages. Tactics: `next/image` with AVIF/WebP, ISR + tag revalidation on catalog writes, streaming + Suspense on PLP/PDP, no client JS for static sections, edge-cached search suggestions, DB indexes per query path (see DATABASE.md).

## 28. Accessibility

WCAG 2.1 AA: semantic landmarks (already in place), focus-visible rings (in place), reduced-motion respected (in place), form labels + `aria-live` for cart/toast updates, color-contrast audit for brand-yellow on white (use ink text on brand fills), keyboard-operable carousels and dropdowns, skip-to-content link.

## 29. Analytics

Event schema (provider-agnostic, start with Vercel Analytics + PostHog): `page_view`, `search`, `filter_apply`, `product_view`, `add_to_cart`, `begin_checkout`, `add_address`, `purchase`, `booking_submit`, `quote_submit`, plus funnel dashboards (search→PDP→cart→purchase). UTM capture on first touch stored on user profile.

## 30. Future Scalability

- Read-heavy catalog → ISR + Postgres read replicas; search extracted to Typesense when SKUs > ~5 k.
- Queue-based side effects (emails, webhooks) via QStash/Supabase queues.
- Multi-warehouse inventory + city expansion via `warehouses` + `serviceable_pincodes` zoning.
- Vendor marketplace, project management, and mobile app consume the same service layer (all business logic in `lib/services/*`, never in components).
