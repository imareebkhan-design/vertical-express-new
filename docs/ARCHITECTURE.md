# Vertical Express — Technical Architecture (Phase 3)

## 1. Stack Decision

| Layer | Choice | Rationale |
| --- | --- | --- |
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** | Already in place; RSC keeps catalog pages server-rendered and cheap |
| Styling / UI | **Tailwind v4 + existing design tokens + shadcn/ui primitives** | Current `@theme` tokens stay the single source of truth; shadcn added per-component (dialog, sheet, form, dropdown, tabs, table) skinned with our tokens |
| Motion | **Framer Motion (existing `Reveal`/`Stagger`/`Magnetic`) + GSAP where scroll-linked** | No change |
| Backend | **Next.js Server Actions (mutations) + Route Handlers (public GET/webhooks)** on Vercel | One deployable; no separate API server until scale demands |
| Database | **Supabase PostgreSQL** | Managed Postgres + Auth + Storage in one; RLS for defense-in-depth |
| ORM | **Prisma** | Typed schema-as-code, migrations in CI; Supabase client reserved for Auth/Storage/Realtime |
| Auth | **Supabase Auth** — phone OTP primary, email + Google secondary; `@supabase/ssr` cookie sessions | Matches reference UX (OTP-first India market) |
| Storage | **Supabase Storage** — buckets: `products`, `categories`, `banners`, `avatars`, `invoices` (private) | Signed URLs for invoices; public CDN for catalog |
| Payments | **Razorpay** (Orders API + webhooks) + Pay-on-Delivery flag | India rails: UPI/cards/netbanking |
| Search | **Postgres FTS (tsvector + pg_trgm)** now → **Typesense** when SKUs > ~5 k | Zero extra infra at MVP; clean seam via `lib/services/search.ts` |
| Caching | ISR + `revalidateTag` per entity (`product:{id}`, `category:{slug}`, `catalog`), `unstable_cache` for nav/settings, Redis (Upstash) only when needed | CDN does the heavy lifting |
| Email/SMS | Resend (React Email) + MSG91/Twilio Verify for OTP-adjacent SMS | Transactional set from PRD §23 |
| Analytics | Vercel Analytics + PostHog (events schema PRD §29) | Funnels + session replay |
| Monitoring | Sentry (client+server) + Vercel logs | Error budget for checkout |

## 2. Application Architecture

```
Browser ──RSC/HTML── Vercel (Next.js)
             │            ├── Route Handlers  /api/*  (public GETs, webhooks, sitemap)
             │            ├── Server Actions  (cart, checkout, account mutations)
             │            └── lib/services/*  ← ALL business logic lives here
             │                    │
             │                    ├── Prisma ─→ Supabase Postgres (RLS on)
             │                    ├── Supabase Auth (cookies via @supabase/ssr)
             │                    ├── Supabase Storage (images, invoices)
             │                    ├── Razorpay SDK  ←─ webhook /api/webhooks/razorpay
             │                    └── Resend / SMS provider
```

Rules:
- Components never import Prisma; they call `lib/services/*` (server) or actions.
- Every mutation: zod-validate → authorize → service call → `revalidateTag` → typed result `{ ok, data | error }`.
- Money stored as integer paise; never floats.

## 3. Folder Structure

```
app/
  (marketing)/            # existing homepage + services marketing (unchanged UI)
  (shop)/
    categories/page.tsx
    category/[slug]/page.tsx        # PLP
    product/[slug]/page.tsx         # PDP
    search/page.tsx
    cart/page.tsx
    checkout/page.tsx
    checkout/confirmation/[orderId]/page.tsx
  (account)/account/…               # dashboard, orders, addresses, wishlist, profile
  (auth)/login | register | verify
  admin/…                           # role-gated group
  api/
    products/route.ts  search/suggest/route.ts
    webhooks/razorpay/route.ts
    sitemap.xml/route.ts  robots.txt/route.ts
actions/                 # server actions per module: cart.ts, checkout.ts, address.ts, auth.ts, wishlist.ts, orders.ts, booking.ts, quote.ts
components/
  ui/                    # shadcn-skinned primitives
  sections/              # existing marketing sections (untouched)
  shop/                  # ProductGrid, FilterSidebar, SortSelect, PriceRange,
                         # GalleryCarousel, BulkTierTable, QtyStepper, CartLine,
                         # AddressCard, OrderTimeline, EmptyState, Skeletons
lib/
  services/              # catalog.ts, search.ts, cart.ts, checkout.ts, orders.ts,
                         # payments.ts, addresses.ts, wishlist.ts, bookings.ts,
                         # quotes.ts, notifications.ts, admin/*
  validators/            # zod schemas shared by actions + route handlers
  db.ts (prisma)  supabase/ (server & browser clients)  auth.ts  money.ts  utils.ts
prisma/schema.prisma  prisma/seed.ts
docs/  emails/  middleware.ts
```

## 4. Security

- Supabase RLS on all user-owned tables (`user_id = auth.uid()`); service-role key only inside server runtime.
- `middleware.ts`: session refresh; guards `/account`, `/checkout`; `/admin` additionally requires `admin_users` membership (checked server-side per layout, not only middleware).
- Zod validation at every boundary; Prisma parameterization (no raw SQL string interp).
- Razorpay webhook: signature verification + idempotency key on `payments.gateway_event_id`.
- Rate limiting (Upstash) on OTP send, login, search suggest, quote submit.
- Security headers via `next.config.ts` (CSP, HSTS, frame-deny); no secrets client-side (`NEXT_PUBLIC_` audit in CI).
- Audit log on all admin mutations and order/payment state changes.

## 5. Admin & CMS

Admin is a route group in the same app (separate deployment only if team grows): data tables (shadcn table + server pagination), forms with zod, optimistic status transitions, CSV product import, image upload to Storage with server-side processing (sharp) to WebP.
CMS entities (banners, blogs, FAQs, settings, announcement messages) are DB-backed and editable in admin; public pages read them via cached services — replacing today's hardcoded `lib/data.ts` progressively.

## 6. Deployment & CI/CD

- **Vercel**: production = `main`, preview per PR; env vars per environment; cron for abandoned-cart + low-stock digests.
- **Supabase**: separate staging + production projects; Prisma migrations applied by CI (`prisma migrate deploy`) on merge.
- **GitHub Actions**: PR pipeline = typecheck → eslint → `prisma validate` → unit tests (vitest) → build; `main` pipeline additionally runs migrations then relies on Vercel build.
- Seed script provisions categories/brands/sample products for previews.
- Rollback: Vercel instant rollback + migrations kept backward-compatible (expand-migrate-contract).
