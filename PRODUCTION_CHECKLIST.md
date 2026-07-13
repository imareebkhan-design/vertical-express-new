# Vertical Express — Production Checklist

> Use this before every deployment. Check off items as you go.

---

## 🔴 MUST DO before going live

### Infrastructure & Environment
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your production domain (e.g. `https://verticalexpress.in`)
- [ ] Set `DATABASE_URL` and `DIRECT_URL` to production Supabase Postgres (pooled + direct)
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to production project
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` in server-only env (never exposed client-side)
- [ ] Set `ADMIN_EMAILS` to real admin email addresses (comma-separated)
- [ ] Run `npx prisma migrate deploy` against production DB
- [ ] Run seed scripts (`prisma/seed.ts`, `prisma/seed-services.ts`) on first deploy
- [ ] Configure Supabase Auth email redirect URL: `https://yourdomain.com/auth/confirm`

### Payments
- [ ] If launching with Razorpay: set `PAYMENT_GATEWAY=razorpay` and implement `RazorpayPaymentProvider` in `lib/services/payments.ts`
- [ ] If launching with COD only: ensure `PAYMENT_GATEWAY=dummy` (default) and inform users
- [ ] Test end-to-end order flow in production before launch

### Security
- [ ] Add rate limiting to `/api/search/suggest` (recommended: Upstash Ratelimit or Vercel Edge)
- [ ] Verify Supabase RLS (Row Level Security) policies are enabled on all tables
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` if it was ever committed to source control
- [ ] Confirm `ADMIN_EMAILS` does NOT contain test/placeholder emails

### DNS & Hosting
- [ ] Configure custom domain on Vercel / hosting platform
- [ ] Enable HTTPS (auto on Vercel, configure manually otherwise)
- [ ] Verify `robots.txt` returns 200 at `https://yourdomain.com/robots.txt`
- [ ] Verify `sitemap.xml` returns 200 at `https://yourdomain.com/sitemap.xml`
- [ ] Submit sitemap to Google Search Console

---

## 🟡 RECOMMENDED (before or shortly after launch)

### Performance
- [ ] Add `prefers-reduced-motion` check to hero carousel auto-play in `components/sections/hero.tsx`
- [ ] Audit Lighthouse scores post-deploy (target: Performance > 85, Accessibility > 85)
- [ ] Enable Vercel Analytics or equivalent for real user monitoring

### Accessibility
- [ ] Add "Skip to main content" link at the top of `app/layout.tsx`
- [ ] Audit icon-only buttons in navbar for `aria-label` attributes
- [ ] Verify brand yellow (#FFD600) text contrast meets WCAG AA on all backgrounds
- [ ] Test keyboard navigation through checkout flow end-to-end

### UX Polish
- [ ] Add inline "Add new address" flow inside checkout when user has no saved addresses
- [ ] Improve orders empty state with a "Start shopping" CTA button
- [ ] Add `loading.tsx` for `/cart`, `/account`, and `/checkout` routes

### Error Reporting
- [ ] Wire `app/error.tsx` and `app/global-error.tsx` to a real error reporting service (Sentry, Bugsnag, etc.)
- [ ] Replace `console.error(error)` in error boundaries with `captureException(error)` or equivalent

---

## 🟢 POST-LAUNCH (when scale demands it)

### Database
- [ ] Scope inventory decrement in `lib/services/checkout.ts` to `warehouseId` when moving to multi-warehouse fulfillment
- [ ] Add `OrderSequence` table with DB-level auto-increment for human-readable, guaranteed-unique order numbers
- [ ] Monitor slow query log for N+1 patterns as product catalog grows

### Admin
- [ ] Move admin authorization from env `ADMIN_EMAILS` to `admin_users` DB table with roles/permissions
- [ ] Add pagination to admin orders and products lists

### Payments
- [ ] Implement and test Razorpay webhook handler for payment confirmation
- [ ] Add retry logic for `PAYMENT_FAILED` orders

### Monitoring
- [ ] Set up uptime monitoring (e.g., Better Uptime, Checkly)
- [ ] Configure Vercel alerts for function errors and timeouts
- [ ] Set up database connection pool monitoring

---

## ✅ Already Done (no action needed)

- [x] TypeScript: 0 errors
- [x] ESLint: 0 warnings/errors
- [x] Production build: clean (85 routes)
- [x] `next.config.ts` warnings: fixed
- [x] `metadataBase`: configured
- [x] `robots.txt` and `sitemap.xml`: created
- [x] `not-found.tsx` (404): created
- [x] `error.tsx` (route error boundary): created
- [x] `global-error.tsx` (global error boundary): created
- [x] Order number race condition: fixed
- [x] All server actions: auth-gated
- [x] All mutations: Zod-validated
- [x] Unused imports: removed
- [x] Guest cart merge: implemented
- [x] Cart persistence: DB-backed (not localStorage)
- [x] Private pages: `robots: { index: false }`
- [x] `loading.tsx`: exists for category + product pages
