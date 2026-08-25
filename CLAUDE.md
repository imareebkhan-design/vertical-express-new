# Vertical Express — Engineering Operating Manual

> **Read this file before touching anything.** It is the operating manual for all
> engineering work on this repository. If any other document, comment, or prior
> instruction contradicts this file, this file wins — unless the owner says otherwise
> in writing.

---

## Product

Vertical Express is a construction-material commerce and hyperlocal delivery platform.
A customer — a homeowner mid-renovation, a contractor standing on a half-built slab —
opens their phone, finds cement or wire or plywood, sees a correct price, confirms we
deliver to their site, and places an order that physically arrives.

It also carries a **Services** side: booking architects, contractors, electricians,
plumbers, carpenters and turnkey home construction. Services share the same database
and auth but are a separate domain from the materials catalog.

## Market

**Srinagar, Jammu & Kashmir — first and only.** The architecture must not prevent
expansion across J&K and other Indian cities later, but **no multi-city feature is to
be built now.** Design so it is possible; do not build it.

Market realities that change engineering decisions:

- Buyers are on mid-tier Android over 4G that degrades. Performance is a requirement,
  not a polish item.
- Phone-based identity is the norm. Email-first auth is wrong here.
- COD will likely be a large share of GMV. Cash handling is a first-class concern.
- Construction is sharply seasonal (build Apr–Oct, interiors Nov–Mar, near-dormant
  Jan–Feb) and winter genuinely disrupts delivery.
- Trade purchasing runs on relationships and negotiated quantity pricing.

## Existing System

**This is a working system, not a prototype. Roughly 78% of it is production-reusable.**
See `docs/CURRENT_SYSTEM_AUDIT.md` for the full assessment.

| | |
|---|---|
| Framework | Next.js 15.5.20 App Router, React 19.1, TypeScript strict, Turbopack |
| Styling | Tailwind CSS v4 + `class-variance-authority` (no shadcn/Radix) |
| Database | PostgreSQL via Supabase (`ap-south-1`), pooled 6543 / direct 5432 |
| ORM | Prisma 6.19 — 25 models, 11 enums, 6 migrations |
| Auth | Supabase Auth OTP — **currently email channel**, provider-abstracted |
| API | Server Actions primary (`actions/*.ts`) + 3 route handlers (`app/api/*`) |
| Domain logic | `lib/services/*.ts`, all `import "server-only"` |
| Validation | Zod 4 (`lib/validators/index.ts`) |
| Payments | Razorpay fully implemented; **`dummy` gateway active by default** |
| Mobile | Capacitor 8 scaffolded (`capacitor.config.ts`, `mobile-shell/`) — not built |
| Hosting | Vercel, `bom1` edge |
| Tests | 67 tests, 11 files (`lib/**/*.test.ts`) — run against a local Postgres, `npm test` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — typecheck, lint, test on every push |

Scale: 133 TS/TSX files, ~10,500 LOC, 60 components, 17 domain services.

**What is already correct and must be preserved:**
money as integer paise throughout · cart stores no price (server resolves on read) ·
order idempotency enforced by a DB unique constraint with a P2002 race catch ·
race-free stock decrement via `updateMany` + `gte` guard · HMAC signature verification
with `crypto.timingSafeEqual` · webhook dedupe on `gatewayEventId` · RLS lockdown
migration closing the Supabase PostgREST backdoor · `server-only` discipline ·
ownership checks on carts, addresses and orders.

## Mission

**Convert this working implementation into a real production commerce system that can
take a real Srinagar customer's money and physically deliver their materials.**

Not a rewrite. Not a refactor. Correction and completion.

The blocking work is: four commercial-correctness defects, a catalog that is entirely
fictional, an auth channel that is wrong for the market, and a fulfilment half that
does not exist yet.

---

## Architecture Principles

1. **Preserve the existing working architecture.** The audit says it is sound. Changing
   it costs months and buys nothing.
2. **Modular monolith.** One Next.js app, one database, one deployment. Domain
   boundaries live in `lib/services/*`.
3. **No microservices.** Not for MVP, not for P0A, not for P0B. Catalog, pricing,
   inventory, cart, checkout, orders and payments share transactional boundaries.
   Splitting them creates distributed transactions and loses money.
4. **Server-authoritative pricing.** The client sends `variantId` and `qty`. It never
   sends a price. `CartItem` stores no price — this is deliberate, keep it that way.
5. **Server-authoritative inventory.** Availability and stock decrement are computed
   and enforced in the database, never trusted from the client.
6. **Server-authoritative serviceability.** Delivery promise, fee and COD eligibility
   come from `ServiceablePincode`, never from a hardcoded label.
7. **Payment-provider-authoritative payment status.** The webhook is the truth. The
   client callback is advisory. An order confirms because Razorpay says so, not because
   a browser said so.
8. **Transactional order integrity.** Order + items + payment + stock decrement + status
   event succeed together or not at all.
9. **Idempotency for critical operations.** Order placement, payment capture and webhook
   processing must each be safe to retry. The **database unique constraint** is the
   guarantee; the application-level check is only an optimisation.
10. **Mobile-first.** Design at 380px. Every millisecond of JS is a millisecond on a
    ₹9,000 Android.
11. **Future web + mobile share one backend.** Business logic lives in `lib/services/*`
    and must remain callable from both a Server Action and an HTTP endpoint. Never put
    commerce logic in a React component.
12. **No speculative business rules.** If a rule (a price, a delivery time, a COD limit,
    a GST rate) is not confirmed by the owner, **do not invent it.** Stop and ask.

---

## Engineering Rules

**Before editing**
- Read the file and its callers first. Understand the existing pattern before changing it.
- Check `docs/CURRENT_SYSTEM_AUDIT.md` and `docs/KNOWN_ISSUES.md` — the problem may
  already be catalogued with a recommended fix.

**While editing**
- **Smallest safe change.** Fix the defect. Do not tidy the neighbourhood.
- **No broad refactors without explicit owner approval.** Renaming, restructuring
  directories, swapping libraries, or "improving" working code is out of scope.
- Follow the existing conventions: `import "server-only"` on services, Zod at
  boundaries, `ActionResult` discriminated unions from server actions, paise integers
  for money, `@map` snake_case in Prisma.
- No `any`. No `@ts-ignore` without a comment explaining why.

**Testing**
- **Commerce-critical logic requires tests.** Pricing resolution, money arithmetic, GST,
  inventory concurrency, order idempotency, webhook dedupe, serviceability. A visual
  render test is not sufficient for any of these.
- A test that would have caught the bug you are fixing must exist before the fix is
  considered done.

**Before reporting done**
- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- New and changed logic has tests, and they pass.
- No secrets in the diff.

**Schema**
- Every schema change gets a named Prisma migration and a note in `docs/DATABASE_SCHEMA.md`.
- Never drop a column in the same release that stops writing it. Expand → migrate →
  contract, across releases.
- Migrations currently run automatically in `vercel-build`. **This is a known risk
  (see KNOWN_ISSUES ISS-024).** Until it is gated, treat every migration as
  production-affecting.

**Secrets**
- Never print, log, or commit a credential.
- Never ask the owner to paste a key into a chat. Tell them which env var to set; they
  set it in Vercel themselves.
- `NEXT_PUBLIC_*` is browser-visible. Nothing sensitive goes there.

**Production safety**
- **Never silently fall back to a dummy or mock service in production.** If a real
  provider is unconfigured, fail loudly. A payment gateway that pretends to work is
  worse than one that is down. (This is currently violated — see ISS-002.)

**Stopping**
- **Stop and ask when owner or business input is required.** Do not guess a price, a
  GST rate, a delivery time, a COD limit, a brand name, or a policy. Guessing these
  produces a system that looks finished and is wrong.

---

## Source of Truth Hierarchy

When two sources disagree, the higher number wins.

| Rank | Source | Scope |
|---|---|---|
| **1** | **The existing repository** | What the system *actually does today.* Code beats every document. |
| **2** | **`docs/CURRENT_SYSTEM_AUDIT.md`** | Known technical findings, reuse assessment, gap matrix. |
| **3** | **Approved architecture documents** — `docs/DECISIONS.md`, `docs/ENGINEERING_ROADMAP.md`, `docs/P0A_ARCHITECTURE_FREEZE.md` (once created) | Decisions already made and their rationale. |
| **4** | **Owner-confirmed business requirements** — recorded in `docs/OWNER_INPUT_REQUIRED.md` once answered | Prices, rates, areas, SLAs, policies, claims. |
| **5** | **HomeRun (home-run.co)** | **Functional and UX reference only.** |

### On HomeRun — read this carefully

HomeRun is a Bangalore competitor studied for its **functional and UX patterns**:
trade-shaped taxonomy, inline variant selection on product cards, benefit strips,
no-minimum-order positioning, calculator-as-funnel, COD prominence.

> **HomeRun is NOT a source for copying proprietary source code, branding, trademarks,
> logos, marketing copy, product photography, testimonials, or any protected creative
> asset. Do not scrape their site. Do not reproduce their text. Do not use their
> images.** Where the existing repository already mirrors HomeRun's structure too
> closely (category naming, footer layout, a "Fevicol" category with no Fevicol
> products), treat that as technical debt to diverge from, not a pattern to extend.

### Documents that have drifted

The repository contains earlier documents — `AUDIT_REPORT.md`, `PRODUCTION_CHECKLIST.md`,
`PRODUCT_ROADMAP.md`, `task.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`,
`docs/GAP_ANALYSIS.md`, `docs/PRODUCTION_AUDIT.md`, `docs/API_SPEC.md`,
`docs/DATABASE_SCHEMA.md`. **These predate `CURRENT_SYSTEM_AUDIT.md` and may be stale.**
Read them for background; do not treat them as current. Where they conflict with the
audit, the audit wins.

---

## Current Priorities

In order. Do not jump ahead without a reason.

| # | Priority | Why it is here |
|---|---|---|
| 1 | **Production safety** | The dummy gateway can confirm orders with no money taken (ISS-002) |
| 2 | **Money / GST correctness** | GST is added *on top* of displayed prices — every customer overcharged 18% (ISS-001) |
| 3 | **Checkout & payment hardening** | External HTTP inside a DB transaction; no payment amount verification (ISS-003, ISS-005) |
| 4 | **Inventory correctness** | Decrement hits all warehouses when unresolved (ISS-004) |
| 5 | **Commerce regression tests** | Subtle correctness work is entirely unprotected (ISS-013) |
| 6 | **Authentication** | Email OTP must become phone OTP (ISS-006) |
| 7 | **Real catalog** | 45 fictional products, 10 invented brands (ISS-007) — *blocked on owner* |
| 8 | **Cart** | Stock check on add, coupon wiring (ISS-016, ISS-011) |
| 9 | **Orders** | Transition enforcement, audit log (ISS-014, ISS-015) |
| 10 | **Fulfilment** | Shipment, driver, dispatch, POD — does not exist (ISS-009) |
| 11 | **COD** | Collection and reconciliation — does not exist (ISS-010) |
| 12 | **Monitoring** | No Sentry, no uptime, no analytics (ISS-012) |
| 13 | **Mobile API readiness** | Ensure services are callable over HTTP, not only via Server Actions |

Legal pages, canonical-domain configuration, and removal of fabricated claims
(ISS-008, ISS-017, ISS-018) are **launch blockers that can be done at any time** and
should be picked up whenever a task is blocked on owner input.

---

## Do Not Build Yet

Each of these is blocked on owner confirmation, or deliberately deferred. Building any
of them now produces work that will be thrown away.

**Blocked on owner input:**
- Contractor / trade tier pricing — *unknown whether needed in P0A*
- Real GST rates and HSN codes per category — *requires the owner's CA*
- Delivery zones beyond a pincode list — *launch area unconfirmed*
- Delivery SLA display — *the 60-minute claim is unverified*
- COD value limits — *no policy exists*
- Free-delivery threshold — *₹500 is a hardcoded guess in `lib/services/cart.ts`*
- Return and refund workflow — *policy unconfirmed*
- Any testimonial, rating, or "authorised brand" claim — *all currently fabricated*

**Deliberately deferred (see `docs/DECISIONS.md`):**
- Redis, Typesense/Algolia, PostGIS, Inngest, tRPC, Cloudflare R2, TWA/Bubblewrap
- `CheckoutSession` and `InventoryReservation` tables
- Multi-city / multi-warehouse routing
- Live GPS driver tracking, route optimisation
- Full WhatsApp Business API integration (a `wa.me` link covers P0A)
- Native mobile app build — **see `docs/MOBILE_PRODUCT_DIRECTION.md`**
- Reviews, personalisation, loyalty, credit terms
- Construction cost calculator (high value, but P1)

---

## Definition of Done

A task is **not** complete until every line below is true. Report against this list
explicitly.

**Correctness**
- [ ] The stated objective is met, and the acceptance criteria in the task are satisfied
- [ ] No business rule was invented — every value came from the owner or an existing confirmed source
- [ ] Money handled as integer paise; no floats touched currency
- [ ] Nothing price-, stock-, or payment-related is trusted from the client

**Quality gates**
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] Tests written for any commerce-critical logic touched, and passing
- [ ] Existing tests still pass

**Safety**
- [ ] No secrets in the diff, in logs, or in error messages
- [ ] No new silent fallback to a mock/dummy service
- [ ] Schema changes have a named migration and are documented
- [ ] The change is reversible, or the rollback path is written down in the task notes

**Communication**
- [ ] Files changed are listed
- [ ] Any deviation from the plan is stated, with the reason
- [ ] Anything discovered that needs owner input is raised, not guessed
- [ ] `docs/KNOWN_ISSUES.md` updated if an issue was resolved or a new one found

**If you cannot tick every box, say so and stop. A half-finished commerce change
reported as done is worse than one reported as blocked.**
