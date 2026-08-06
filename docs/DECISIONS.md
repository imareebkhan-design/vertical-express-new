# Architecture Decision Record — Vertical Express

*Decisions already made, with the reasoning that produced them. When a decision is
revisited, do not delete the entry — append a superseding decision and mark the original
`SUPERSEDED BY DEC-nnn`.*

**Status values:** `ACCEPTED` · `PROPOSED` · `SUPERSEDED` · `REVISIT AT <trigger>`

---

## DEC-001 — Preserve the existing repository

**Status:** ACCEPTED · **Date:** 6 Aug 2026

**Decision.** Keep `vertical-express-new` as the single repository and production
codebase. Do not rebuild. Do not initialise a second repository. Do not port to a
different framework.

**Rationale.** The full source audit found a working Next.js 15 commerce application
with a properly normalised 25-model schema, a clean three-layer backend, and — critically
— the hard parts already done correctly: money as integer paise, server-resolved pricing
with no price stored on cart items, order idempotency enforced by a database unique
constraint with a P2002 race catch, race-free stock decrement via `updateMany` with a
`gte` guard, timing-safe HMAC signature verification, webhook deduplication, and an RLS
lockdown migration that properly closes the Supabase PostgREST backdoor. That is careful
work, expensive to reproduce and easy to get subtly wrong. Assessed reuse: **~78%**.

**Alternatives considered.**
*Rebuild greenfield from the Founding CTO Blueprint* — 10–14 weeks to reach the same
place, discarding working software. No architectural finding justified it.
*Migrate to Shopify* — would forfeit bulk pricing, unit-of-measure modelling and
checkout control, which are exactly the differentiators. HomeRun runs on Shopify and
publicly states it does not offer bulk discounts, which is the evidence.
*Headless commerce framework (Medusa/Saleor/Vendure)* — more time spent fighting the
framework's opinions than writing the ~4,000 lines actually needed.

**Consequences.** Remaining work is correction and completion (~3 weeks), not
construction. Existing conventions must be followed rather than replaced. Pre-existing
technical debt is inherited — notably the absence of tests. Some earlier repository
documents have drifted and must be treated as background, not truth.

**Revisit?** No. Only a discovered architectural defect that cannot be fixed in place
would justify reopening this, and the audit found none.

---

## DEC-002 — Custom commerce architecture

**Status:** ACCEPTED · **Date:** 6 Aug 2026 (originally proposed in the Founding CTO
Blueprint, confirmed by the audit)

**Decision.** Own the commerce logic — catalog, pricing, inventory, cart, checkout,
orders, payments — rather than delegating it to a hosted platform or a commerce
framework.

**Rationale.** Four requirements are precisely where hosted platforms are weakest:
quantity-break bulk pricing, customer-tier pricing, a real serviceability engine, and
non-standard construction units of measure (bags, sheets, running feet, bundles). The
reference competitor demonstrates all four failure modes on a hosted platform. Beyond
that, the operational half — dispatch, pick lists, COD cash reconciliation — has no home
on a storefront platform, and would require a second system kept in sync.

**Alternatives considered.** Shopify (blocks bulk and tier pricing below Plus; checkout
uncustomisable); headless Shopify (retains the constraints, adds a second system);
open-source commerce frameworks (framework-fighting exceeds the code saved).

**Consequences.** Full control over the differentiating capabilities. Low running cost.
No vendor lock-in. The team owns uptime, security and payment edge cases — mitigated by
managed services and Razorpay's hosted checkout, which keeps the system entirely out of
PCI scope.

**Revisit?** No.

---

## DEC-003 — Modular monolith

**Status:** ACCEPTED

**Decision.** One Next.js application, one PostgreSQL database, one deployment. Domain
boundaries expressed as modules under `lib/services/*`, each `import "server-only"`,
communicating through explicit service functions.

**Rationale.** This is already the existing structure and it is the right one. It gives
every boundary benefit of separated services with none of the distributed-systems cost.
Business logic stays out of React components, which is what makes it reusable by a future
mobile client.

**Alternatives considered.** Microservices (rejected — see DEC-004). A single
undifferentiated `lib/` (rejected — boundaries erode without them, especially when an AI
assistant will happily import anything that resolves).

**Consequences.** One deploy, one transaction boundary, one place to look. Boundaries
are a convention rather than a hard constraint, so discipline is required — consider
adding `eslint-plugin-boundaries` if drift appears.

**Revisit?** Only at a scale far beyond current projections. Natural future extraction
seams: search, notifications, delivery.

---

## DEC-004 — No microservices for MVP, P0A or P0B

**Status:** ACCEPTED

**Decision.** Do not split catalog, pricing, inventory, cart, checkout, orders or
payments into separate services.

**Rationale.** These modules share transactional boundaries. Order placement must write
the order, its items, the payment record, the stock decrement and the status event
atomically. Splitting them creates distributed transactions, which is the fastest known
way to lose money in commerce. The team is also very small — operational complexity is a
real cost, not a theoretical one.

**Consequences.** Simpler operations and correct transactional semantics, at the cost of
scaling the whole application together — irrelevant at current volume.

**Revisit?** Only if a specific module develops a genuinely different workload shape.
Search is already external in effect (Postgres full-text); notifications and delivery are
the next clean seams.

---

## DEC-005 — Server-authoritative pricing, inventory and serviceability

**Status:** ACCEPTED — **already implemented, must be preserved**

**Decision.** The client sends intent (`variantId`, `qty`, `pincode`). It never sends a
price, a stock figure, a delivery promise or a total. All are resolved server-side on
every read.

**Rationale.** This is the single most important correctness property in a commerce
system. It is already implemented correctly — `CartItem` deliberately stores no price;
`getCartSummary()` resolves the bulk tier ladder fresh on every call; serviceability
comes from `ServiceablePincode`, not from a hardcoded label.

**Consequences.** Price tampering is structurally impossible. Slightly more computation
per read, offset by caching. **Any future change that stores a resolved price on a cart
item, or accepts a price from the client, is a regression and must be rejected in review.**

**Revisit?** Never.

---

## DEC-006 — Payment-provider-authoritative payment status

**Status:** ACCEPTED — already implemented

**Decision.** An order is confirmed because the payment provider's signed webhook says
so, not because a browser callback said so. The client callback is advisory; the webhook
is the truth.

**Rationale.** Client callbacks are lost routinely — a customer backgrounds the app, loses
signal on a construction site, or closes the tab. If order confirmation depends on the
client, money is taken with no order created. The existing implementation already handles
both paths independently and converges correctly.

**Consequences.** Orders confirm reliably regardless of client state. Requires webhook
idempotency (present, via `Payment.gatewayEventId @unique`) and, still missing, an amount
verification check (ISS-005) and a reconciliation poller for lost webhooks (ISS-029).

**Revisit?** Never.

---

## DEC-007 — Idempotency enforced by database constraints

**Status:** ACCEPTED — already implemented

**Decision.** Order placement is idempotent on a client-supplied `idempotencyKey`;
webhook processing is idempotent on `(provider, gatewayEventId)`. **The database unique
constraint is the guarantee; the application-level lookup is only an optimisation.**

**Rationale.** An application check alone loses the race between two concurrent
submissions. The existing code gets this right — it attempts the insert and catches
Prisma's `P2002` unique-violation, re-reading the winning row.

**Consequences.** Double-taps, retries and duplicate webhook deliveries are structurally
safe. Every new critical write path must follow the same pattern.

**Revisit?** Never.

---

## DEC-008 — Mobile-first, designed at 380px

**Status:** ACCEPTED

**Decision.** Design and test at 380px first. Desktop is an enhancement.

**Rationale.** The customer is standing in a partially built room on a mid-tier Android
over degrading 4G, possibly with dusty hands and one free hand. This is not a
hypothetical persona; it is the primary one.

**Consequences.** Performance budget is a requirement, not polish. Primary touch targets
should be generous (~52px) rather than minimal. Directly implicates ISS-031 — three
animation libraries and a welcome-popup interstitial are shipped to exactly this device.

**Revisit?** No.

---

## DEC-009 — A future mobile app shares this backend and business logic

**Status:** ACCEPTED

**Decision.** Vertical Express will ultimately be web + mobile over one shared commerce
backend. The mobile client will **never** independently implement pricing, inventory,
serviceability, checkout calculation, order truth or payment truth.

**Rationale.** Duplicating commerce logic in a mobile client guarantees the two
implementations diverge, and the divergence is discovered when a customer is charged a
different price on the app than on the web. Keeping logic in `lib/services/*` — framework-free
and free of React — means it can be exposed over HTTP without restructuring.

**Consequences.** Domain logic must stay out of Server Actions themselves (actions should
be thin wrappers) and out of components. An HTTP API surface will be needed for the
mobile client — Stage 6 of the roadmap. See `MOBILE_PRODUCT_DIRECTION.md`.

**Revisit?** No.

---

## DEC-010 — Do not build the mobile application before the commerce core stabilises

**Status:** ACCEPTED

**Decision.** No mobile application work until P0A is complete and the commerce core is
stable and tested. Capacitor scaffolding may remain in the repository, unbuilt.

**Rationale.** Building a client against a backend with four known correctness defects,
a fictional catalog and no fulfilment loop means building against a moving target and
throwing the work away. There is also no evidence yet that app-installed users behave
differently — that data does not exist because there are no users.

**Consequences.** The App Store and Google Play badges currently on the live site
advertise applications that do not exist and must be removed (ISS-008). The final mobile
technology choice — Capacitor, React Native/Expo, Flutter, or a PWA — is deliberately
deferred to Stage 6/7.

**Revisit at:** completion of Stage 5 (end-to-end P0A), with a mobile API readiness
analysis.

---

## DEC-011 — Remove speculative infrastructure from the plan

**Status:** ACCEPTED · **Date:** 6 Aug 2026

**Decision.** Delete from the plan: Redis/Upstash, Typesense/Algolia/Meilisearch,
PostGIS, Inngest, tRPC, Cloudflare R2, TWA/Bubblewrap, `CheckoutSession` table,
`InventoryReservation` table, and the five-level pricing precedence engine.

**Rationale.** The Founding CTO Blueprint proposed these for a greenfield build. The
audit showed each is either already solved or solves a problem that does not exist:

| Removed | Because |
|---|---|
| Redis | The `RateLimit` table already works across serverless instances; ISR handles caching |
| Typesense/Algolia | 45 SKUs. Postgres `pg_trgm` gives typo tolerance and synonyms for free. Revisit past ~2,000 SKUs. |
| PostGIS | `ServiceablePincode` is the correct abstraction for a single city |
| Inngest | No async work exists; stock decrements synchronously |
| tRPC | Server Actions already provide end-to-end type safety — pure duplication |
| Cloudflare R2 | Supabase Storage is already provisioned and included |
| TWA/Bubblewrap | Capacitor is already scaffolded and strictly better |
| `CheckoutSession` | Order placement is a single atomic action; a session table adds state for no benefit |
| `InventoryReservation` | Only needed for hold-before-payment; synchronous decrement is simpler and correct |
| 5-level pricing engine | `BulkPriceTier` works. Add customer tier only, and only if the owner confirms it is needed. |

**Consequences.** Estimated infrastructure cost falls from ~$110–140/month to ~$45–70/month.
Roughly seven integrations disappear from the build plan. Fewer moving parts for a very
small team to operate.

**Revisit at:** Typesense past ~2,000 SKUs. Redis if rate-limit contention appears in
the database. Inngest when notification retries are needed. PostGIS at multi-city.

---

## DEC-012 — Real business rules require owner confirmation

**Status:** ACCEPTED

**Decision.** Engineering may not invent prices, GST rates, HSN codes, delivery times,
delivery charges, COD limits, serviceable areas, brand names, return policies, or any
public claim. Where a value is unknown, work stops and the owner is asked.

**Rationale.** Inventing these produces a system that looks finished and is wrong — and
wrong in ways that cost money, breach compliance, or create legal exposure. The audit
found this had already happened: a fictional catalog, a hardcoded ₹500 free-delivery
threshold, a flat 18% GST rate with a placeholder HSN code, fabricated testimonials, and
a fabricated Google rating.

**Consequences.** Some work is blocked on the owner and must wait. `OWNER_INPUT_REQUIRED.md`
tracks exactly what. Engineering that is *not* blocked — the four correctness defects,
tests, monitoring, security headers, the canonical-domain fix — proceeds in parallel.

**Revisit?** Never.

---

## DEC-013 — HomeRun is a functional reference, never a code or asset source

**Status:** ACCEPTED

**Decision.** HomeRun (home-run.co) may be studied for functional and UX patterns.
No proprietary source code, branding, trademark, marketing copy, product photography,
testimonial or protected creative asset may be copied.

**Rationale.** They are a direct competitor. Copying protected assets is both a legal
exposure and a strategic error — their constraints are not ours, and several of their
patterns are workarounds for platform limitations we do not have.

**Consequences.** Where the existing repository already mirrors HomeRun too closely —
category naming, footer structure, a `Fevicol` category containing no Fevicol products,
a Series-A-style funding banner — that is technical debt to diverge from, not a pattern
to extend. Product photography must be brand-supplied with permission, or shot in-house.

**Revisit?** Never.

---

## DEC-014 — Keep Supabase for auth, database and storage

**Status:** ACCEPTED

**Decision.** Remain on Supabase — Postgres, Auth and Storage — in `ap-south-1`.

**Rationale.** Already integrated and working. Correct region for Srinagar latency and
for Indian data-residency expectations under the DPDP Act. The RLS lockdown migration is
already in place and correctly written. Auth, database and storage in one provider is
one fewer thing for a small team to operate. Migration cost would be high and the benefit
zero.

**Consequences.** Vendor concentration on Supabase. Phone OTP requires configuring an SMS
provider (MSG91 or Twilio) inside Supabase rather than calling it directly — acceptable,
and the existing `auth-provider.ts` abstraction already isolates it.

**Revisit?** Only on a sustained reliability problem.

---

## DEC-015 — Razorpay as payment provider, behind the existing abstraction

**Status:** ACCEPTED

**Decision.** Razorpay via its hosted Standard Checkout, kept behind the existing
`PaymentProvider` interface.

**Rationale.** Already fully implemented in `lib/services/payments.ts`, including HMAC
signature verification with `crypto.timingSafeEqual` for both the client callback and the
webhook. Best UPI success rates in India. Hosted checkout means card data never touches
our servers, keeping the system entirely out of PCI scope — which removes a whole
category of compliance liability from a very small team.

**Consequences.** Merchant onboarding requires GST, PAN, bank proof and business
registration, and takes 3–7 days — it is on the critical path. **The `dummy` provider must
throw in production (ISS-002) before any real traffic.** The abstraction means a second
provider can be added later without touching order logic.

**Revisit?** Only on a sustained settlement or reliability problem.

---

## DEC-016 — Phone OTP replaces email OTP

**Status:** ACCEPTED — **not yet implemented** (ISS-006)

**Decision.** Authentication moves from email OTP to Indian mobile OTP. Email remains
available as a fallback channel, not the default.

**Rationale.** Contractors and tradespeople in Srinagar transact by phone. Many will not
have an email address they check on site. Requiring one at the moment of purchase — the
point of maximum motivation — loses a large share of the target market. The existing
`auth-provider.ts` already abstracts the channel, so this is configuration plus a UI
change, not a rewrite. A further problem: on the Supabase free tier the default email
template sends a magic **link**, not the 6-digit code the UI promises.

**Consequences.** Requires an SMS provider configured in Supabase, and Indian DLT template
registration (3–5 days). Ongoing per-SMS cost. Rate limiting on the OTP endpoint should
fail **closed** rather than open (ISS-021), and SMS spend needs a cost alert.

**Revisit?** No.

---

## DEC-017 — Launch honest on delivery time

**Status:** PROPOSED — **awaiting owner decision (Owner Q6)**

**Decision (recommended).** Launch with "same day if ordered before 2 PM" rather than the
"60 minutes" currently advertised, and tighten the promise publicly as operations mature.

**Rationale.** The delivery promise is a configuration value in `ServiceablePincode.etaMinutes`,
so launching conservatively costs nothing and tightening later is a marketing event. In a
market with winter road closure, Old City lanes inaccessible to four-wheelers, and trade
that runs on personal relationships, one broken promise costs a network of contractors
rather than a single customer. HomeRun's own FAQ contradicts their 60-minute badge
(60–120 minutes; bulk items next-day) — the claim is marketing, not capability.

**Alternatives.** Keep the 60-minute claim (rejected unless operations can genuinely
sustain it). Show no delivery estimate (rejected — it is the gating question for the
customer).

**Consequences.** Less aggressive positioning at launch, materially lower risk of early
reputational damage.

**Revisit at:** owner confirmation of real operational capability.

---

## DEC-018 — P0A scope is fixed to a single closed loop

**Status:** ACCEPTED

**Decision.** P0A means exactly one thing: a real Srinagar customer completes a real paid
order, and operations physically fulfil it, with nothing done in a spreadsheet. Anything
outside that loop is P0B or later.

**Rationale.** Scope discipline is the main determinant of whether this launches. The gap
matrix contains 40 items; the closed loop needs about 15 of them.

**Consequences.** Genuinely valuable features — the construction cost calculator, reviews,
saved project lists, the knowledge hub, contractor tier pricing — are explicitly deferred.
See `ENGINEERING_ROADMAP.md` and the "Do Not Build Yet" section of `CLAUDE.md`.

**Revisit at:** completion of Stage 5.
