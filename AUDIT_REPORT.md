# Vertical Express — Production Readiness Audit

> **Audit date**: July 13 2026  
> **Build status at audit start**: ✅ Zero TS errors · Zero lint errors · `npm run build` clean  
> **Build status at audit end**: ✅ Zero TS errors · Zero lint errors · `npm run build` clean

---

## Executive Summary

| Area | Score | Status |
|------|-------|--------|
| Build Health | 10/10 | ✅ Clean |
| Architecture | 9/10 | ✅ Excellent |
| Security | 8/10 | ✅ Good (1 pre-launch item) |
| Performance | 8/10 | ✅ Good |
| UX / UI | 9/10 | ✅ Excellent |
| Accessibility | 7/10 | ⚠️ Minor gaps |
| API Design | 9/10 | ✅ Excellent |
| Database Layer | 8/10 | ✅ Good (1 fix applied) |
| SEO | 9/10 | ✅ Excellent |
| Error Handling | 7/10 | ✅ Fixed (3 pages added) |
| Deployment Readiness | 9/10 | ✅ Ready |

**Overall: 8.5 / 10 — Ready for production with minor pre-launch items.**

---

## 1. Build Health ✅

| Check | Result |
|-------|--------|
| TypeScript compilation | ✅ 0 errors |
| ESLint | ✅ 0 warnings / errors |
| `npm run build` (production) | ✅ Clean |
| `next.config.ts` warnings | ✅ Fixed (`outputFileTracingRoot`, `metadataBase`, `turbopack.root`) |

---

## 2. Architecture ✅

### Strengths
- **Clean server/client boundary**: 55 client components precisely `"use client"` scoped; 8 server-only files correctly guard DB access with `import "server-only"`.
- **Server Actions pattern**: All mutations go through `actions/` with a uniform `ActionResult<T>` envelope — type-safe, no custom API routes needed for mutations.
- **Service layer**: `lib/services/` isolates business logic completely from route handlers.
- **Prisma + Supabase Auth**: Auth handled by Supabase; persistence by Prisma on the same Postgres — no impedance mismatch.
- **Middleware**: Session refresh on every matched route. Auth guard on `/account` and `/checkout` prefixes. Correctly excludes static assets.

### Minor Notes
- `lib/services.ts` at root and `lib/services/` directory could confuse newcomers — consider documenting or consolidating.

---

## 3. Security ✅

### Findings

| Severity | Finding | Status |
|----------|---------|--------|
| 🔴 Critical | — | None found |
| 🟠 High | — | None found |
| 🟡 Medium | Search suggest API (`/api/search/suggest`) has no rate-limiting. Open to mass-scraping product catalog. | Pre-launch item |
| 🟡 Medium | Serviceability API (`/api/serviceability/[pincode]`) — unauthenticated, cached, no rate-limit | Pre-launch item |
| 🟢 Low | Admin gate uses email allowlist (`ADMIN_EMAILS` env). Adequate for MVP; move to `admin_users` DB table as team grows. | Documented, acceptable for v1 |
| 🟢 Low | Dummy payment gateway wired to `razorpay` ID as a facade — clearly documented in code | Acceptable |

### Security Positives
- Supabase `getUser()` called server-side (not client-forgeable `getSession()`).
- All server actions verify `userId` via `getAuthUserId()` before any DB write.
- Address ownership enforced: `findFirst({ where: { id, userId } })` before order placement.
- Zod validation on all external inputs (pincode, phone, address, cart quantities).
- CSRF protection via Next.js Server Actions (origin-checking built-in).
- `robots: { index: false }` on all account, checkout, and admin pages.

### Pre-Launch Recommendation
Add Upstash Ratelimit or Vercel Edge Rate Limiting to `/api/search/suggest` before launch.

---

## 4. Performance ✅

| Area | Finding | Status |
|------|---------|--------|
| Images | All dynamic `<img>` uses have `eslint-disable-next-line` (intentional for external URLs with runtime fallback). `product-card.tsx` and `category-card.tsx` use `loading="lazy"`. | ✅ Acceptable |
| Cache headers | Search suggest: `max-age=60, s-maxage=300`. Serviceability: `max-age=3600`. | ✅ Good |
| Loading states | `loading.tsx` exists for category and product pages (the two heaviest data routes). | ✅ |
| Animations | Framer Motion used in hero carousel. Consider `prefers-reduced-motion` media query for low-power devices. | 🟡 Recommend |
| DB queries | Cart, orders, addresses loaded with `Promise.all()`. | ✅ Good |
| Prisma connection | Singleton with global reference in dev, fresh in prod — correct pattern. | ✅ |

---

## 5. UX / UI ✅

### Browser Audit Results (all pages HTTP 200)

| Page | Status | Notes |
|------|--------|-------|
| Homepage (`/`) | ✅ | Hero carousel, categories, services all render |
| Categories (`/categories`) | ✅ | |
| Category (`/category/[slug]`) | ✅ | Filter/sort UI functional |
| Product (`/product/[slug]`) | ✅ | Gallery, variant selector, add-to-cart |
| Cart (`/cart`) | ✅ | |
| Checkout (`/checkout`) | ✅ | Redirects to login when unauthenticated ✅ |
| Search | ✅ | Typeahead renders |
| Account (`/account`) | ✅ | Overview with stat cards |
| Orders (`/account/orders`) | ✅ | |
| Admin (`/admin`) | ✅ | |
| Services (`/services`) | ✅ | |

### UX Findings

| Severity | Finding |
|----------|---------|
| 🟡 | Checkout: if user has no saved addresses, no inline "Add address" option — must navigate to `/account/addresses` first |
| 🟡 | Orders empty state: "No orders yet." — could include a CTA to shop |
| 🟢 | Account nav highlights current page correctly |
| 🟢 | Announcement bar dismissible, state persisted |
| 🟢 | Cart persists across sessions (DB-backed, not localStorage) |
| 🟢 | Guest cart merges into user cart on login |

---

## 6. Accessibility ⚠️

| Area | Finding | Severity |
|------|---------|----------|
| Skip link | No "Skip to main content" link on any page | 🟡 |
| Reduced motion | Hero carousel auto-plays without `prefers-reduced-motion` check | 🟡 |
| Icon buttons | Some icon-only buttons in navbar may need `aria-label` | 🟡 |
| Color contrast | Brand yellow (`#FFD600`) on white may fail WCAG AA for small text sizes | 🟡 |
| Form labels | Address form labels correctly associated via react-hook-form | ✅ |
| Semantic HTML | `<main>`, `<nav>`, `<section>`, `<header>`, `<footer>` used correctly | ✅ |

---

## 7. API Design ✅

| API | Auth | Validation | Caching |
|-----|------|------------|---------|
| `GET /api/search/suggest?q=` | None (public) | None (DB parameterized, safe) | 60s/5min CDN |
| `GET /api/serviceability/[pincode]` | None (public) | Zod pincodeSchema ✅ | 1hr CDN |
| `GET /auth/confirm` | Supabase token | Token verified by SDK ✅ | No-cache |

All mutations use Server Actions — no custom POST endpoints requiring additional CSRF/auth hardening.

---

## 8. Database Layer ✅

### Fixes Applied During Audit

| Issue | Fix |
|-------|-----|
| **Order number race condition**: `tx.order.count() + 1` inside a transaction could produce duplicate `orderNo` under concurrent load | ✅ **Fixed**: Now uses `Date.now().toString(36) + random hex suffix`. DB `UNIQUE` constraint on `orderNo` is the final safety net. |

### Remaining Notes

| Area | Finding | Severity |
|------|---------|----------|
| Inventory decrement | `findFirst({ where: { variantId } })` picks a random warehouse record. Correct for single-warehouse MVP; must scope to `warehouseId` before multi-warehouse launch. | 🟡 Pre-multi-warehouse |
| Inventory validation | Stock check uses `aggregate` (sum across all warehouses) — internally consistent with decrement logic for now. | ✅ |
| Cart merge | Guest cart delete uses `.catch(() => {})` — intentional best-effort cleanup for empty carts. | ✅ Acceptable |
| Schema | 25 models. `orderNo @unique` ✅. All FK relations defined. | ✅ Clean |

---

## 9. SEO ✅

| Item | Status |
|------|--------|
| `metadataBase` in root layout | ✅ Added |
| `robots.txt` | ✅ Added |
| `sitemap.xml` (dynamic) | ✅ Added — includes products and categories |
| Per-page `<title>` | ✅ All pages have descriptive titles |
| `robots: { index: false }` on private pages | ✅ Account, checkout, admin |
| Single `<h1>` per page | ✅ Verified |
| Semantic HTML | ✅ |

---

## 10. Error Handling ✅

### Fixes Applied During Audit

| Issue | Fix |
|-------|-----|
| No `not-found.tsx` | ✅ **Created** `app/not-found.tsx` — branded 404 page |
| No `error.tsx` | ✅ **Created** `app/error.tsx` — route-level error boundary with reset + home nav |
| No `global-error.tsx` | ✅ **Created** `app/global-error.tsx` — catches root layout failures |

### Error Architecture Strengths
- Server actions return `ActionResult<T>` — errors never surface as uncaught exceptions to the client.
- Checkout handles all expected codes: `OUT_OF_STOCK`, `PINCODE_UNSERVICEABLE`, `COD_UNAVAILABLE`, `CART_EMPTY`, `ADDRESS_NOT_FOUND`.
- Payment provider abstraction catches gateway failures as `PAYMENT_FAILED`.

---

## 11. Deployment Readiness ✅

### Required Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | ✅ | Prisma DB (pooled via PgBouncer) |
| `DIRECT_URL` | ✅ | Prisma migrations (direct connection) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-side Supabase admin |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Auth email redirects, sitemap, metadataBase |
| `ADMIN_EMAILS` | ✅ | Comma-separated admin allowlist |
| `PAYMENT_GATEWAY` | Optional | `dummy` (default) or `razorpay` |
| `AUTH_OTP_CHANNEL` | Optional | `email` (default) or `phone` |

---

## Summary of All Changes Made During Audit

| File | Change |
|------|--------|
| `lib/services/checkout.ts` | Fixed order number race condition — replaced `count()+1` with timestamp+random hex |
| `app/not-found.tsx` | **New** — branded 404 page |
| `app/error.tsx` | **New** — route-level error boundary |
| `app/global-error.tsx` | **New** — global root layout error boundary |
| `next.config.ts` | Fixed `outputFileTracingRoot` + `turbopack.root` warnings |
| `app/layout.tsx` | Added `metadataBase` |
| `app/sitemap.ts` | **New** — dynamic sitemap with products + categories |
| `app/robots.ts` | **New** — robots.txt |
| `lib/services.ts` | Removed unused `DoorOpen` import |
