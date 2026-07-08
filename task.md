# Execution Checklist

## Milestone 0 — Foundation
- [x] Install prisma@6, @prisma/client, @supabase/supabase-js, @supabase/ssr, zod, tsx
- [x] prisma/schema.prisma — identity + catalog + commerce core (21 models), validated
- [x] prisma/seed.ts — 20 categories, 10 brands, 45 products w/ variants + bulk tiers, warehouse, 25 Srinagar pincodes, FIRST3 coupon
- [x] lib/db.ts, lib/money.ts, lib/validators/index.ts (ActionResult envelope)
- [x] lib/supabase/server.ts + client.ts (@supabase/ssr, async cookies)
- [x] .env.example; db scripts in package.json; typecheck green
- [x] Supabase CLI authenticated (user ran login)
- [x] Created project gsfslnxvwmrgulzqypdp (ap-south-1); .env written (aws-1 pooler)
- [x] Migration `init` applied; seeded 20 categories / 10 brands / 45 products / 25 pincodes
- [x] Verified via live query (bulk tiers + inventory + images intact)

## Milestone 1 — Authentication ✅
- [x] OtpProvider abstraction (lib/services/auth-provider.ts) — email now, phone = AUTH_OTP_CHANNEL config flip
- [x] actions/auth.ts: sendOtp, verifyOtp (mirrors user + merges guest cart), signOut
- [x] /login two-step OTP page (brand-styled) + /auth/confirm magic-link route
- [x] middleware.ts session refresh + guards /account, /checkout
- [x] Navbar AccountButton: login link ↔ account dropdown (Account, Orders, Sign out)
- [x] lib/services/users.ts mirror + cart-merge implemented
- [x] E2E verified: admin-minted OTP → verifyOtp session → users+profile mirrored; middleware redirect + UI confirmed in browser; prod build green
- Note: free-tier Supabase can't customize email templates — email carries magic link; code-in-email appears automatically once custom SMTP is configured (config-only)
## Milestone 2 — PLP + Category pages ✅
- [x] lib/services/catalog.ts: listProducts (filters/facets/sort/pagination), getCategoryBySlug, listCategories, listCategorySlugs
- [x] /category/[slug] PLP: breadcrumb + BreadcrumbList JSON-LD, sort, pagination, empty state, generateStaticParams + ISR (revalidate 300), generateMetadata
- [x] /categories index (all 20 tiles → /category/<slug>)
- [x] Reusable shop components: CatalogGrid, SortSelect (URL state), Pagination, EmptyState, loading.tsx skeletons
- [x] ProductCard made reusable (optional href → PDP link, hides 0%-off badge/strikethrough when no discount)
- [x] Homepage category tiles + Materials nav dropdown → real /category routes
- [x] E2E verified: 4 cement products render, price_asc sort (210→310→320→385), categories grid, prod build green
- Note: unknown slug renders correct 404 page but HTTP 200 (Next.js streamed-route soft-404); acceptable, revisit if hard-404 needed for SEO
## Milestone 3 — PDP ✅
- [x] catalog service: getProductBySlug (full payload), getRelatedProducts, listProductSlugs
- [x] lib/services/serviceability.ts + GET /api/serviceability/[pincode] (cached 1h)
- [x] /product/[slug]: gallery, tier-aware price, variant selector, qty stepper, bulk-tier table (live "Your price"), next-tier nudge, pincode check, trust row, description, specs, related products, Product+Breadcrumb JSON-LD, sticky mobile action bar, generateStaticParams (45 PDPs) + ISR, loading skeleton
- [x] Deals cards + PLP cards link to PDP
- [x] E2E verified: qty 11 → tier 10+ @ ₹315, cart total ₹3,465, nudge recalculated; serviceability API correct; prod build (45 static PDPs) green
## Milestone 4 — Search + Filters ✅
- [x] lib/services/search.ts (Postgres ILIKE; Typesense-swappable) + GET /api/search/suggest (cached)
- [x] SearchBox typeahead (debounced 250ms, products/categories groups, Enter → /search) wired into navbar
- [x] /search results page: filters + sort + pagination + empty state, robots noindex
- [x] FilterSidebar (brand checkboxes w/ counts + price range, URL-state) + FilterSheet (mobile bottom-sheet)
- [x] Filters added to category PLP too (shared components)
- [x] catalog listProducts already supported search/brand/price facets
- [x] E2E verified: suggest API (3 products + 1 category), /search?q=cement (4 products), brand filter, empty state; prod build green
## Milestone 5 — Cart + Wishlist ✅
- [x] lib/services/cart.ts: server cart w/ live tier pricing, next-tier nudges, free-delivery meter, stock check
- [x] actions/cart.ts: addToCart/updateCartItem/removeCartItem + guest anon_id httpOnly cookie
- [x] hooks/use-cart.tsx rewritten server-backed (optimistic count, debounced qty sync to fix rapid-click race)
- [x] /cart page: line items, tier badges, free-delivery progress bar, sticky order summary, empty state
- [x] Homepage Deals now server-driven (getDeals) with real variant IDs; ProductCard/PDP/FloatingCart/navbar wired to server cart
- [x] Wishlist: lib/services/wishlist.ts + actions (toggle, getMyWishlistIds), heart on cards (hydrated client-side via context so catalog pages stay static), /account/wishlist page (auth-guarded)
- [x] E2E verified: guest add persists to DB, badge updates, cart tier pricing (qty 10 → ₹315/bag total ₹3,150), remove → empty, wishlist guard redirects; prod build green (catalog pages static)
- Note: guest wishlist-heart click rolls back (needs login); improve to login-redirect later
## Milestone 6 — Addresses ✅
- [x] lib/services/addresses.ts: list/create/update/delete/setDefault with default-promotion logic
- [x] actions/address.ts: saveAddress (create+update), removeAddress, makeDefaultAddress + advisory serviceability check
- [x] AddressForm (label chips, validated fields, Srinagar defaults) + AddressManager (cards, edit/delete/set-default)
- [x] /account/addresses page (auth-guarded)
- [x] E2E verified: default-promotion logic (auto-default first, promote on delete-default) via DB; guest guard redirects; build green
## Milestone 7 — Checkout (dummy gateway) + Confirmation ✅
- [x] lib/services/payments.ts: PaymentProvider interface (Dummy/COD now, Razorpay drops in behind same API via PAYMENT_GATEWAY env)
- [x] lib/services/checkout.ts: computeTotals (delivery fee from pincode serviceability + free-delivery), placeOrder txn (stock validate → order+items+payment+status event → decrement stock → clear cart)
- [x] lib/services/orders.ts: getOrderByNo, listOrders, cancelOrder (restock), reorder
- [x] actions/checkout.ts: getCheckoutTotals, placeOrder (online→active gateway / cod)
- [x] /checkout 3-step (contact/address/payment) + live totals + serviceability guard; /checkout/confirmation/[orderNo]
- [x] E2E verified (DB): order VE-2026-000001, tier snapshot ₹315, free delivery, total ₹3150, payment captured, status event, stock -10, cart cleared; prod build green (4 routes)
## Milestone 8 — My Orders + Dashboard ✅
- [x] actions/orders.ts: cancelOrder (restock + status event), reorder (copy to cart)
- [x] /account overview: stat cards (orders/addresses/wishlist counts), recent orders, default address
- [x] /account/orders: order list w/ status badges, item thumbnails, date/total, pagination
- [x] /account/orders/[orderNo]: status timeline, items, totals, address, cancel + reorder actions
- [x] Reusable OrderStatusBadge, OrderActions, AccountNav components
- [x] E2E verified (DB): cancel → status cancelled + stock restored + event logged; reorder → cart x5; listOrders; prod build green (5 account routes)
