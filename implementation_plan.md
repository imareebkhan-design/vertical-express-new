# Implementation Plan — Current Priority Modules

> Antigravity Mode C artifact. Execution starts only after approval. Scope = the 13 priority modules; UI/branding unchanged; docs/PRD.md, docs/ARCHITECTURE.md, docs/DATABASE.md, docs/API.md are the contracts.

## Milestone 0 — Foundation (prerequisite for everything)
- `[NEW]` Supabase project + env vars; `[NEW]` prisma/schema.prisma (tables from DATABASE.md §Identity, §Catalog, §Commerce core) + seed script (20 categories, brands, ~60 products with variants/tiers/images from existing assets)
- `[NEW]` lib/db.ts, lib/supabase/{server,client}.ts, lib/money.ts, lib/validators/
- `[MODIFY]` middleware.ts (session refresh)
- Exit: `prisma migrate dev` + seeded preview deploy.

## Milestone 1 — Authentication (module 8)
- `[NEW]` actions/auth.ts (sendOtp, verifyOtp, signOut, updateProfile)
- `[NEW]` app/(auth)/login — OTP modal-style page matching current popup aesthetics
- `[MODIFY]` navbar Login button → auth state (avatar menu: Account, Orders, Sign out)
- Exit: phone OTP round-trip on preview; guest cart merge stub.

## Milestone 2 — Products: PLP + Category pages (modules 1, 2)
- `[NEW]` app/(shop)/category/[slug]/page.tsx + app/(shop)/categories/page.tsx
- `[NEW]` components/shop/{ProductGrid, ProductCardCompact, Skeletons, EmptyState}
- `[MODIFY]` homepage category tiles + nav dropdowns → real hrefs
- ISR + generateMetadata + BreadcrumbList JSON-LD.

## Milestone 3 — PDP (module 3)
- `[NEW]` app/(shop)/product/[slug]/page.tsx — gallery, price/compare-at, qty stepper, bulk-tier table, specs, delivery pincode check, related products, Product JSON-LD, sticky mobile action bar
- `[MODIFY]` deals ProductCard links → PDP.

## Milestone 4 — Search + Filters (modules 4, 5)
- `[NEW]` /api/search/suggest + typeahead panel in navbar search
- `[NEW]` app/(shop)/search/page.tsx; components/shop/{FilterSidebar, SortSelect, PriceRange, FilterSheet(mobile)}
- URL-state filters (searchParams), facet counts, zero-result state.

## Milestone 5 — Cart + Wishlist (modules 6, 7)
- `[NEW]` actions/cart.ts + actions/wishlist.ts; app/(shop)/cart/page.tsx
- `[MODIFY]` existing FloatingCart + ProductCard ADD → server cart (optimistic)
- Tier auto-apply + next-tier nudge; free-delivery meter; guest anon_id cookie; wishlist hearts on cards + /account/wishlist.

## Milestone 6 — Address Management (module 9)
- `[NEW]` actions/address.ts; app/(account)/account/addresses; components/shop/AddressCard/AddressForm
- Serviceability check via serviceable_pincodes; navbar pincode chip reads real data.

## Milestone 7 — Checkout + Confirmation (modules 10, 11)
- `[NEW]` actions/checkout.ts; app/(shop)/checkout (3-step single page); Razorpay client + /api/webhooks/razorpay; COD path; stock reserve/decrement; confirmation page + email (Resend)
- Exit: end-to-end test order in Razorpay test mode on preview.

## Milestone 8 — My Orders + User Dashboard (modules 12, 13)
- `[NEW]` app/(account)/account/{page,orders,orders/[orderNo],profile}
- OrderTimeline (status events), cancel + reorder actions, dashboard cards (recent order, default address, wishlist count).

Each milestone = one PR: typecheck + lint + build green, preview-verified (browser), then merged. task.md checklist maintained during execution.

**Deferred (explicitly out of current scope):** admin dashboard, CMS, notifications center, analytics wiring, reviews, quotes/booking backend — schemas already accommodate them.
