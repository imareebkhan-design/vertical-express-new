# Handoff to Claude Code — Vertical Express

*The final handoff. Read `CLAUDE.md` first, then this.*

---

# Where We Are

Planning is complete. **Implementation has not started. No application code has been
modified.**

A working Next.js 15 commerce application already exists and is deployed at
`verticalexpress.in`. It was fully audited at source level on 6 August 2026. **Assessed
reuse: ~78%.** We are correcting and completing it — **not rebuilding it.**

The Owner Decision Gate Round 1 has been issued and **not yet answered**. Roughly half
the P0A work is blocked on that; the other half is not and should start now.

---

# What Already Works

Do not touch these except to fix a documented issue.

- **Catalog** — 20 categories, product detail with a visible bulk-price ladder, filters,
  sort, pagination
- **Cart** — database-backed for both guests (`anonId`) and users, with live bulk-tier
  price resolution and a free-delivery meter. **Stores no price** — resolved server-side
  on every read
- **Bulk pricing** — fully working end to end, ladder visible without a login, applied
  live in cart, `appliedTierMinQty` snapshotted onto the order. **This is the strongest
  feature in the codebase and is already ahead of the reference competitor**
- **Serviceability** — real pincode lookup returning ETA, delivery fee and COD eligibility
- **Auth** — Supabase OTP with a channel abstraction; middleware route protection with
  defense-in-depth at the admin layout
- **Checkout and orders** — transactional placement, idempotent on a database unique
  constraint with a P2002 race catch, race-free stock decrement via `updateMany` + `gte`,
  full address and price snapshots onto the order
- **Payments** — Razorpay fully implemented, HMAC verification with
  `crypto.timingSafeEqual`, webhook deduplication on `gatewayEventId`
- **Account** — order history with a status timeline, address book with soft delete,
  wishlist, service bookings
- **Security** — RLS lockdown migration closing the Supabase PostgREST backdoor,
  `import "server-only"` on every service, ownership checks throughout, no client secrets
- **Admin** — authenticated area with dashboard, orders, products (read-only), bookings

---

# What Is Broken

Full detail in `KNOWN_ISSUES.md`. The five that matter most:

| ID | Issue | Severity |
|---|---|---|
| **ISS-001** | **GST added on top of displayed prices** — customer sees ₹320, is charged ₹377.60 | **CRITICAL** |
| **ISS-002** | **`dummy` gateway confirms orders with no money taken** and decrements stock | **CRITICAL** |
| **ISS-003** | Razorpay HTTP call executes inside the database transaction | HIGH |
| **ISS-004** | Inventory decrement hits **all** warehouses when none resolves | HIGH |
| **ISS-005** | Payment capture amount is never verified against the order total | HIGH |

Plus: no tests at all (ISS-013), no monitoring (ISS-012), no audit log (ISS-015), no
fulfilment loop (ISS-009), no COD tracking (ISS-010), admin products read-only (ISS-019),
canonical URLs on the wrong host (ISS-018), migrations auto-run on production deploy
(ISS-024).

---

# What Is Mock / Demo

| | |
|---|---|
| **The entire catalog** | 10 invented brands, 45 invented products, invented prices, invented stock |
| **All testimonials** | Five fabricated quotes attributed to named individuals in named Srinagar localities |
| **"Rated 4.9 on Google"** | Fabricated |
| **App Store / Play badges** | `href="#"` — no app exists |
| **Footer** | **"recreated for educational purposes"** |
| **GST engine** | Self-documented as demo mode: flat 18%, placeholder HSN `7308` |
| **Payment gateway** | `dummy` by default |
| **Warehouse and pincodes** | Placeholder seed values |
| **Free-delivery threshold** | ₹500 hardcoded in `lib/services/cart.ts` |
| **Coupon engine** | Complete model, `discountPaise` hardcoded to `0` — unreachable |

---

# What Needs Owner Confirmation

See `OWNER_INPUT_REQUIRED.md` for the full list with blocking levels. The five that block
the most work:

1. **Are displayed prices GST-inclusive or exclusive?** — blocks ISS-001
2. **Real catalog data** — brands, SKUs, prices, stock, and what format it exists in
3. **Real serviceable pincodes and an achievable delivery SLA** — the 60-minute claim is
   unverified
4. **COD limits and who collects and reconciles cash** — there is currently no limit at all
5. **Which public claims are real** — everything unconfirmed must be removed

---

# What Claude Code May Change

- Anything listed in `KNOWN_ISSUES.md` with status `OPEN` and no owner block
- Bug fixes with a documented issue ID
- New tests, always
- New migrations that **add** — columns, tables, indexes
- Configuration: `next.config.ts` headers, CI workflow, monitoring setup
- Content strings that are documented as fabricated (ISS-008)
- New files that implement a queued task

---

# What Claude Code Must Not Change Yet

- **The overall architecture.** Modular monolith, Supabase, Prisma, Next.js App Router,
  Server Actions — all settled (`DECISIONS.md`)
- **Anything in "What Already Works"** except to fix a documented issue
- **Working components.** 52 of 60 are keepers. No cosmetic refactors.
- **The server-authoritative pattern.** Never store a resolved price on a cart item.
  Never accept price, stock or totals from the client.
- **Business values.** No inventing a price, rate, SLA, limit or policy
- **Destructive migrations.** No dropping columns or tables without explicit approval
- **Dependencies.** No adding Redis, Typesense, PostGIS, Inngest, tRPC or R2 —
  all explicitly removed (DEC-011)
- **Mobile.** No app build before Stage 6 (DEC-010)

---

# Immediate Engineering Objective

**Make the commerce engine correct and protected, without waiting for the owner.**

Four correctness defects plus the test suite that keeps them fixed. All of it is
unblocked. None of it requires a single business answer.

---

# Recommended First Engineering Task

## TASK 001 — Production safety gate

**Objective.** Make it impossible for the application to take an order in production
using a mock payment provider.

**Why first.** It is the highest-severity issue, the smallest change, it requires no owner
input, and it removes the possibility of free orders before anything else is touched.
Everything else in Stage 1 is safer with this in place.

**Files likely affected.** `lib/services/payments.ts` · `actions/checkout.ts` ·
new `lib/services/__tests__/payments.test.ts` · possibly `next.config.ts` or a boot
assertion module

**Database changes.** None.

**Implementation.** `activeGateway()` throws a clear, named error when
`process.env.NODE_ENV === "production"` and either `PAYMENT_GATEWAY !== "razorpay"` or the
Razorpay keys are absent. Keep `dummy` available for development and tests. Add a
boot-time assertion so the application refuses to start in production with a mock gateway
configured, and log which gateway is active at startup.

**Tests.** Production env + no keys → throws · development env → returns `dummy` ·
production env + keys present → returns `razorpay` · integration: order placement under a
production-like env with no keys creates no order and moves no stock.

**Acceptance criteria.** No code path can produce a `confirmed` order with a fabricated
payment record in production. Tests prove all four cases. `npx tsc --noEmit` and
`npm run lint` pass.

**Rollback.** Pure addition of a guard; revert the commit. No data or schema change.

**Owner input required.** None for the fix. Razorpay account status (Q7) is needed only
for activation, which is a later task.

**Estimated complexity.** Small — a few hours including tests.

**Dependencies.** None. This is the entry point.

---

# Files Claude Code Must Read Before Working

**In this order, before the first edit:**

1. **`CLAUDE.md`** — the operating manual. Rules, principles, source-of-truth hierarchy,
   Definition of Done
2. **`docs/CURRENT_SYSTEM_AUDIT.md`** — what the system actually is (955 lines; §10.2
   traces the full commerce path and shows exactly where it stops)
3. **`docs/KNOWN_ISSUES.md`** — every defect with evidence, likely files and recommended fix
4. **`docs/DECISIONS.md`** — what was decided and why, so settled questions are not reopened
5. **`docs/OWNER_INPUT_REQUIRED.md`** — what must never be invented
6. **`docs/ENGINEERING_ROADMAP.md`** — stage sequencing and exit criteria
7. **`docs/PROJECT_CONTEXT.md`** — background, once, for orientation
8. **`docs/MOBILE_PRODUCT_DIRECTION.md`** — before any decision that affects API shape

**Then, in the repository itself:** `prisma/schema.prisma` · `lib/services/checkout.ts` ·
`lib/services/payments.ts` · `lib/services/cart.ts` · `lib/services/tax.ts` ·
`actions/checkout.ts` · `middleware.ts`

**Treat as background, not truth:** `AUDIT_REPORT.md`, `PRODUCTION_CHECKLIST.md`,
`PRODUCT_ROADMAP.md`, `task.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`,
`docs/GAP_ANALYSIS.md`, `docs/PRODUCTION_AUDIT.md`, `docs/API_SPEC.md`,
`docs/DATABASE_SCHEMA.md`, `docs/AUTH_SETUP.md`, `docs/MOBILE_SETUP.md`. These predate the
audit and may have drifted. **Where they conflict with `CURRENT_SYSTEM_AUDIT.md`, the
audit wins.**

---

# Definition of Done

Reproduced from `CLAUDE.md`. Report against it explicitly.

**Correctness** — objective and acceptance criteria met · no business rule invented ·
money as integer paise · nothing price-, stock- or payment-related trusted from the client

**Quality gates** — `npx tsc --noEmit` clean · `npm run lint` clean · tests written for
commerce-critical logic touched and passing · existing tests still pass

**Safety** — no secrets in the diff, logs or error messages · no new silent fallback to a
mock service · schema changes have a named migration and are documented · the change is
reversible or the rollback path is written down

**Communication** — files changed listed · deviations stated with reasons · anything
needing owner input raised rather than guessed · `KNOWN_ISSUES.md` updated

**If you cannot tick every box, say so and stop.**

---

# Stop Conditions

**Stop immediately and ask when:**

1. A business value is needed that is not in `OWNER_INPUT_REQUIRED.md` as answered — a
   price, GST rate, HSN code, delivery time, COD limit, serviceable area, brand name or
   policy
2. A fix requires a broad refactor, a dependency change, or an architectural change
3. A destructive migration appears necessary
4. A defect is found that is not in `KNOWN_ISSUES.md` — document it there first, then ask
   whether to fix it now or queue it
5. Fixing one issue would require changing something in "What Claude Code Must Not Change Yet"
6. `npx tsc --noEmit` or `npm run lint` fails in a way not caused by the current change
7. A change would touch payment, money or stock logic without a test that covers it
8. A task's acceptance criteria cannot be met as written

> **A half-finished commerce change reported as done is worse than one reported as
> blocked. When in doubt, stop and ask.**

---

# Awaiting

**`APPROVE P0A — START TASK 001`**

No code will be modified before that instruction.
