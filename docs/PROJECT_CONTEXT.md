# Project Context — Vertical Express

*History of how this project arrived at its current state. Read once, for orientation.
For what the code does today, read `CURRENT_SYSTEM_AUDIT.md`. For what to do next, read
`HANDOFF_TO_CLAUDE_CODE.md`.*

---

## 1. Business objective

Launch a **Srinagar-first digital platform for ordering construction and building
materials** — cement, steel, electrical, plumbing, sanitary, hardware, paint, plywood
and related supplies — with hyperlocal delivery to construction sites.

The promise: a customer discovers a material, verifies we deliver to their location,
sees an accurate price and stock position, orders, pays online or by COD, and receives
the goods through our own delivery network.

A secondary **Services** line (architects, contractors, electricians, plumbers,
carpenters, turnkey construction) exists in the codebase and shares the same auth and
database.

**Owner stated the physical network already exists** — suppliers, stock, distribution.
The specifics remain unconfirmed and are tracked in `OWNER_INPUT_REQUIRED.md` (Q1).
This matters: it means the constraint on launch is software correctness and data, not
supply chain build-out.

## 2. Reference product

**HomeRun (home-run.co)** — a Bangalore construction-materials quick-commerce business,
Shopify-based, ₹6.6M Series A, 2,000+ SKUs, 105+ pincodes, "60-minute delivery".

Studied for **functional and UX patterns only**. What was worth taking:

- Trade-shaped taxonomy (grouped how a plumber thinks, not how a taxonomist would)
- Inline variant selection directly on the product card
- Benefit strip on every card (delivery time / COD / free-delivery threshold)
- No-minimum-order positioning
- Calculator-as-funnel (their construction cost calculator feeds a filled cart)
- Heavy trust stack answering "will this company actually show up?"

What they get wrong, and where Vertical Express can win:

- Their "60 Mins" badge is static chrome, contradicted by their own FAQ (60–120 min,
  bulk items next-day)
- Serviceability is pincode-only
- They **publicly state they do not offer bulk discounts** — a Shopify-shaped limitation
  presented as pricing philosophy
- Their unit price renders as `₹0.0/` — Shopify cannot model a 50kg cement bag

> **Legal boundary, restated:** HomeRun is a competitor. No proprietary code, branding,
> trademarks, copy, photography or protected asset may be copied. See `CLAUDE.md`.

## 3. The existing Vertical Express implementation

A **working Next.js 15 commerce application** already exists and is deployed at
`verticalexpress.in` on Vercel. It is not a mockup.

**What is genuinely built and working:** catalog browsing with filters and sort ·
product detail with a visible bulk-price ladder · database-backed cart for both guests
and logged-in users with live tier pricing · pincode serviceability returning real ETA,
fee and COD flags · OTP authentication · address book with soft delete · checkout with
idempotent, transactional order placement and race-free stock decrement · Razorpay
integration with HMAC signature verification and a deduplicating webhook · order history
with a status timeline · a wishlist · a services catalog with bookings · a basic admin
area · Capacitor mobile shells scaffolded.

**Assessed reuse: ~78%.** See `CURRENT_SYSTEM_AUDIT.md` §18.

**Three classes of problem:**

1. **Commercial correctness defects** — four of them, one of which (GST added on top of
   displayed prices) overcharges every customer by 18%, and one of which (the `dummy`
   payment gateway) can confirm orders with no money taken.
2. **The catalog is entirely fictional** — 10 invented brands, 45 invented products,
   invented prices. The machinery around it is production-grade; only the contents are
   placeholder.
3. **The fulfilment half does not exist** — the chain runs to `confirmed` and stops.
   No shipment, driver, dispatch, pick list, proof of delivery, or COD reconciliation.

Additionally, the live site carries fabricated public claims — including a footer
reading *"recreated for educational purposes"*, five invented testimonials attributed to
named individuals in named Srinagar localities, and an unverified "Rated 4.9 on Google".

## 4. Decisions already made

Full rationale in `DECISIONS.md`. Summary:

| Decision | Status |
|---|---|
| **Preserve the existing repository.** Do not rebuild, do not start a second repo. | ACCEPTED |
| Custom commerce architecture (not Shopify, not headless, not a commerce framework) | ACCEPTED |
| Modular monolith — one app, one database, one deployment | ACCEPTED |
| No microservices for MVP or P0A/P0B | ACCEPTED |
| Server-authoritative pricing, inventory and serviceability | ACCEPTED (already implemented) |
| Payment-provider-authoritative payment status | ACCEPTED (already implemented) |
| Idempotency enforced by DB constraints on order placement and webhooks | ACCEPTED (already implemented) |
| Mobile-first, designed at 380px | ACCEPTED |
| A future mobile app shares this backend and business logic | ACCEPTED |
| Do not build the mobile app before the commerce core stabilises | ACCEPTED |
| Real business rules require owner confirmation; engineering may not invent them | ACCEPTED |
| HomeRun is a functional reference, never a code or asset source | ACCEPTED |
| Keep Supabase (auth + Postgres + storage, `ap-south-1`, RLS already hardened) | ACCEPTED |
| Keep Prisma, Next.js App Router, Server Actions, Tailwind v4 | ACCEPTED |
| Razorpay as payment provider, behind the existing abstraction | ACCEPTED |
| Phone OTP replaces email OTP | ACCEPTED, not yet implemented |

## 5. Decisions rejected

The original Founding CTO Blueprint was written for a greenfield build. Once the
existing repository was audited, roughly 60% of its proposed infrastructure became
unnecessary. **These were removed from the plan:**

| Rejected | Because |
|---|---|
| **Redis / Upstash** | The `RateLimit` table already works across serverless instances; ISR handles caching |
| **Typesense / Algolia / Meilisearch** | 45 SKUs. Postgres `pg_trgm` gives typo tolerance and synonyms for free. Revisit past ~2,000 SKUs. |
| **PostGIS + zone polygons** | `ServiceablePincode` is the right abstraction for one city |
| **Inngest / job queue** | No async work exists; stock decrements synchronously |
| **tRPC** | Server Actions already provide end-to-end type safety — pure duplication |
| **Cloudflare R2** | Supabase Storage is already provisioned |
| **TWA / Bubblewrap** | Capacitor is already scaffolded and is strictly better |
| **`CheckoutSession` table** | Order placement is a single atomic action; a session table adds state for no benefit |
| **`InventoryReservation` + TTL sweeper** | Only needed for hold-before-payment; synchronous decrement is simpler and correct |
| **5-level pricing precedence engine** | `BulkPriceTier` works. Add customer tier only, if the owner confirms it is needed. |
| **Weather/traffic/load-factor serviceability** | An `isActive` suspension toggle is sufficient |
| **Rebuilding any working component** | 52 of 60 components are keepers |
| **A second repository** | This one is sound |

Effect: infrastructure cost drops from an estimated ~$110–140/month to ~$45–70/month,
and roughly seven integrations disappear from the build plan.

## 6. Current stage

**Planning complete. Implementation not started. No application code has been modified.**

Completed: HomeRun reverse-engineering · Founding CTO Blueprint (greenfield, now
largely superseded) · full source audit of the existing repository · blueprint
reconciliation · P0A definition · Owner Decision Gate Round 1 (**issued, not yet
answered**).

**Immediate blocker:** the owner has not yet answered Round 1. Ten questions covering
business identity, catalog, pricing and GST, inventory, delivery, payments, fulfilment
roles, customer types, claims verification, and launch target. See
`OWNER_INPUT_REQUIRED.md`.

**Engineering is not fully blocked.** Several P0A items — the four correctness defects,
the test suite, monitoring, the canonical-domain fix, and removal of fabricated claims —
require no owner input and can proceed immediately.

## 7. Intended launch market

**Srinagar, J&K.** Exact pincodes and localities unconfirmed (Owner Q6).

Architecture must permit later expansion across J&K and other Indian cities **without a
rewrite** — but no multi-city feature is to be built now.

Constraints that shaped the design: Old City lanes inaccessible to four-wheelers ·
snow closure and winter disruption Dec–Feb · landmark-based addressing rather than
formal street addresses · connectivity interruption as a real risk · sharply seasonal
demand.

## 8. Customer types

Target segments (P0A priority unconfirmed — Owner Q9): homeowners · contractors ·
builders · electricians · plumbers · carpenters · painters · architects and interior
designers · small construction companies · site supervisors · institutional/B2B buyers.

The two that drive most engineering decisions:

- **The contractor** — repeat, high-value, multiple sites, needs bulk pricing, GST
  invoice, and a three-tap reorder. Abandons if he cannot tell whether we deliver to
  *his* site.
- **The trade specialist** (electrician, plumber, carpenter) — knows the exact product
  name, buys small amounts frequently, needs search-to-paid in under 90 seconds.

## 9. Future mobile application

Vertical Express ultimately requires **web + mobile sharing one commerce backend.**

Capacitor 8 is already scaffolded in the repository (`capacitor.config.ts`,
`mobile-shell/index.html`), but no `ios/` or `android/` project has been generated and
no app has been published — while the live site advertises App Store and Google Play
badges linking to `#`.

**The final mobile technology choice is deliberately not made yet.** See
`MOBILE_PRODUCT_DIRECTION.md`. The non-negotiable constraint: the mobile client must
never independently implement pricing, inventory, serviceability, checkout calculation,
order truth or payment truth. Those stay server-side and shared.

## 10. Why we are preserving the current repository

Five reasons, in order of weight:

1. **It works.** A real customer can browse, add to cart, log in, and place an order
   today. That is months of work already banked.
2. **The hard parts are already correct.** Money as integer paise, server-resolved
   pricing, idempotent order placement with a DB-constraint guarantee, race-free stock
   decrement, timing-safe HMAC verification, webhook deduplication, and an RLS lockdown
   migration that properly closes the Supabase PostgREST backdoor. This is careful work
   that is expensive to reproduce and easy to get subtly wrong.
3. **The schema is sound.** 18 of the 31 entities the greenfield blueprint proposed
   already exist, correctly normalised, with snapshots on orders and idempotency keys
   where they matter.
4. **The problems are correction, not construction.** Four defects, a data replacement,
   an auth channel switch, and one missing module. Roughly three weeks — against 10–14
   for a rebuild.
5. **Rebuilding would discard working software to produce the same thing.** There is no
   architectural finding in the audit that justifies it.

> **The existing codebase saved approximately two months. Rebuilding it would be an
> expensive mistake.**
