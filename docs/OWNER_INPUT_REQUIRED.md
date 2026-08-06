# Owner Input Required — Vertical Express

> **Everything on this page is something engineering must NOT invent.**
>
> Inventing any of it produces a system that looks finished and is wrong — wrong in ways
> that cost money, breach compliance, or create legal exposure. This has already happened
> once: the catalog is fictional, the free-delivery threshold is a hardcoded guess, GST is
> a flat placeholder rate, and the homepage carries fabricated testimonials and a
> fabricated Google rating.
>
> **If Claude Code reaches an item on this list, it stops and asks. It does not guess.**

**Blocking levels**

| Level | Meaning |
|---|---|
| **BLOCKS P0A** | A real customer cannot complete a real paid order, or operations cannot fulfil it, until this is answered |
| **BLOCKS P0B** | Needed shortly after launch, not before |
| **DOES NOT BLOCK** | Engineering can proceed now; this refines or improves later |

**Status:** all items are `AWAITING` — Owner Decision Gate Round 1 has been issued and
not yet answered.

---

## 1. Legal and business identity

| # | Item | Blocking | Why engineering cannot decide it | Status |
|---|---|---|---|---|
| 1.1 | Registered legal entity name (as on the GST certificate) | **BLOCKS P0A** | Appears on every GST invoice and in Razorpay onboarding | AWAITING |
| 1.2 | Final customer-facing brand name and spelling | **BLOCKS P0A** | Propagates into the domain, Play Store listing, invoices and all content | AWAITING |
| 1.3 | Real operating address | **BLOCKS P0A** | Footer, contact page and invoices. Currently a placeholder that mirrors HomeRun's footer format. | AWAITING |
| 1.4 | Real customer phone number | **BLOCKS P0A** | **There is currently no phone number anywhere on the site.** A local trade business without one will not be trusted. | AWAITING |
| 1.5 | Real support email | **BLOCKS P0A** | Currently `hello@verticalexpress.co` — wrong TLD; the site is `.in` | AWAITING |
| 1.6 | Domain confirmation — is `verticalexpress.in` final? | **BLOCKS P0A** | Canonical URLs, OG tags, sitemap and Razorpay all key off it (ISS-018) | AWAITING |

## 2. GST and tax

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 2.1 | **Are displayed prices GST-inclusive or exclusive?** | **BLOCKS P0A** | **The single most consequential unanswered question.** The code currently adds 18% on top of the displayed price, so a ₹320 bag charges ₹377.60 (ISS-001). The fix is trivial; the direction is a business fact. | AWAITING |
| 2.2 | GST rate per product category | **BLOCKS P0A** — **REQUIRES CA** | Currently a flat 18% on everything. Cement is commonly 28%. Applying the wrong rate is a compliance failure in both directions. | AWAITING |
| 2.3 | HSN code per product category | **BLOCKS P0A** — **REQUIRES CA** | Currently a hardcoded placeholder `7308` for every product including cement, paint and plywood. HSN is mandatory on a GST invoice. | AWAITING |
| 2.4 | GSTIN | **BLOCKS P0A** | Required on invoices and for Razorpay onboarding | AWAITING |
| 2.5 | GST invoice format approval | **BLOCKS P0A** — **REQUIRES CA** | The invoice must be signed off before it is issued to a customer (ISS-026) | AWAITING |
| 2.6 | Place-of-supply handling for buyers outside J&K | BLOCKS P0B | The code already models intra-state CGST+SGST vs inter-state IGST; the policy needs confirming | AWAITING |

## 3. Real catalog

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 3.1 | Which categories actually launch | **BLOCKS P0A** | 20 categories are seeded, mirroring HomeRun's — including `Fevicol` with no Fevicol products. Empty categories are worse than absent ones. | AWAITING |
| 3.2 | Approximate real SKU count | **BLOCKS P0A** | Determines whether the import is a CSV pipeline or manual entry | AWAITING |
| 3.3 | **Real brand names** | **BLOCKS P0A** | All 10 current brands are invented (`BuildPro`, `AquaSeal`, `FlowMax`, `GripFast`, `HomeCrown`, `LumenX`, `PowerCell`, `SteelEdge`, `TimberCraft`, `Voltix`) | AWAITING |
| 3.4 | Authorised-dealer documentation | **BLOCKS P0A** | The site claims "100% genuine brands, sourced directly". The claim must be defensible. | AWAITING |
| 3.5 | Where product data lives today — Excel, Tally, supplier PDFs, ERP, or paper | **BLOCKS P0A** | Determines whether Stage 3 builds a CSV importer, a Tally export parser, or a manual entry screen — very different amounts of work | AWAITING |
| 3.6 | Product images — brand-supplied or shot in-house | BLOCKS P0B | ~6 real images exist; the rest fall back to category images. **Competitor imagery may not be used.** | AWAITING |
| 3.7 | Unit of measure and pack size per product | BLOCKS P0B | Needed to replace the `unitLabel` display string with structured UoM (ISS-032) | AWAITING |
| 3.8 | Product weight | BLOCKS P0B | Needed for weight-based delivery fees and vehicle class (ISS-033) | AWAITING |

## 4. Real pricing

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 4.1 | Real MRP and selling price per SKU | **BLOCKS P0A** | Every current price is invented | AWAITING |
| 4.2 | Bulk quantity break thresholds and prices | **BLOCKS P0A** | The ladder engine works and already beats the reference competitor — it needs real numbers | AWAITING |
| 4.3 | Is contractor/trade tier pricing needed in P0A? | **BLOCKS P0A** *(the decision, not the build)* | Roughly two days of work. If the trade buyer is the wedge it belongs in P0A; if homeowners come first it is P0B. | AWAITING |
| 4.4 | Contractor discount level and qualification rule | BLOCKS P0B | Only if 4.3 is yes | AWAITING |
| 4.5 | Are per-customer negotiated prices required? | DOES NOT BLOCK | Deferred to P1 regardless | AWAITING |
| 4.6 | How often prices change | DOES NOT BLOCK | Informs whether bulk re-import or per-item editing is the primary admin path | AWAITING |

## 5. Real inventory

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 5.1 | Do we own the stock, or sell supplier stock we do not hold? | **BLOCKS P0A** | If stock is not held, "in stock" becomes a promise rather than a fact and the inventory model changes shape | AWAITING |
| 5.2 | Number and location of godowns | **BLOCKS P0A** | The seed has one placeholder warehouse ("Srinagar Central", 190001). ISS-004 becomes live data corruption once a second warehouse exists. | AWAITING |
| 5.3 | Opening stock count per SKU | **BLOCKS P0A** | Cannot sell what the system does not know we hold | AWAITING |
| 5.4 | Does the godown also serve walk-in customers? | **BLOCKS P0A** | If yes, a safety-stock buffer is required so online and walk-in do not double-sell the same physical bag | AWAITING |
| 5.5 | Who updates stock, and how often | BLOCKS P0B | Determines whether admin needs bulk stock update or per-transaction adjustment | AWAITING |
| 5.6 | Current stock tracking method | DOES NOT BLOCK | Informs import format and migration approach | AWAITING |

## 6. Serviceable area and delivery

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 6.1 | **Exact launch pincodes and localities** | **BLOCKS P0A** | `ServiceablePincode` is currently seeded with placeholders. An unserviceable address must not be able to produce an order (ISS-004). | AWAITING |
| 6.2 | Godown origin point for delivery | **BLOCKS P0A** | Warehouse record and delivery planning | AWAITING |
| 6.3 | **Realistic delivery SLA — the 60-minute claim** | **BLOCKS P0A** | The site promises 60 minutes everywhere. Recommendation is to launch at "same day, order before 2 PM" and tighten publicly (DEC-017). This is the owner's call and it must match reality. | AWAITING |
| 6.4 | Delivery charges | **BLOCKS P0A** | Currently from a seeded placeholder | AWAITING |
| 6.5 | Free-delivery threshold | **BLOCKS P0A** | `FREE_DELIVERY_THRESHOLD_PAISE = 50000` (₹500) is a **hardcoded guess in `lib/services/cart.ts`** (ISS-030) | AWAITING |
| 6.6 | Delivery operating hours and days | **BLOCKS P0A** | Do not promise hours that cannot be staffed | AWAITING |
| 6.7 | Vehicles — how many and what type | BLOCKS P0B | Old City lanes may need a two- or three-wheeler path | AWAITING |
| 6.8 | Heavy-material restrictions (cement, tanks, sheets) | BLOCKS P0B | Whether these ship on the same vehicle or are scheduled separately | AWAITING |
| 6.9 | Same-day vs express capability by area | BLOCKS P0B | Per-area SLA differentiation | AWAITING |

## 7. Payments and COD

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 7.1 | Razorpay merchant account status | **BLOCKS P0A** | Onboarding takes 3–7 days and needs GST, PAN, bank proof and business registration. **On the critical path — start now.** *(Status only. Never paste keys into a chat.)* | AWAITING |
| 7.2 | Which online methods at launch — UPI, cards, net banking | BLOCKS P0B | UPI alone covers most of this market | AWAITING |
| 7.3 | Is COD required at launch? | **BLOCKS P0A** | Likely a large share of GMV; shapes the fulfilment build | AWAITING |
| 7.4 | **COD maximum order value** | **BLOCKS P0A** | **There is currently no limit at all** — a ₹5,00,000 COD order is accepted (ISS-010) | AWAITING |
| 7.5 | COD cap for first-time customers | **BLOCKS P0A** | Standard fraud control; none exists | AWAITING |
| 7.6 | Who physically collects COD cash | **BLOCKS P0A** | Determines the reconciliation model (ISS-010) | AWAITING |
| 7.7 | Who reconciles cash, and how often | **BLOCKS P0A** | Untracked cash is the most common quiet loss in hyperlocal commerce | AWAITING |
| 7.8 | Cancellation policy and window | BLOCKS P0B | Currently unenforced | AWAITING |
| 7.9 | Refund process and who approves | BLOCKS P0B | No refund entity or workflow exists (ISS-025) | AWAITING |

## 8. Returns and refunds

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 8.1 | Return window | **BLOCKS P0A** — **REQUIRES LEGAL** | Needed to write the Refund Policy page, which is legally required and which Razorpay onboarding checks for (ISS-017) | AWAITING |
| 8.2 | Non-returnable categories (cut-to-size, opened cement, mixed paint) | **BLOCKS P0A** — **REQUIRES LEGAL** | Same | AWAITING |
| 8.3 | Who physically collects returns | BLOCKS P0B | Operational design | AWAITING |
| 8.4 | Refund timelines by payment method | BLOCKS P0B | Customer communication | AWAITING |

## 9. Verified business claims

**Every claim below is live on production today and is currently unverified or fabricated
(ISS-008). Anything not confirmed as real and provable must be removed before launch.**

| # | Claim | Blocking | Status |
|---|---|---|---|
| 9.1 | **Footer: "recreated for educational purposes"** | **BLOCKS P0A** | AWAITING — *recommend removal regardless* |
| 9.2 | "Construction materials in 60 minutes" / "Avg. delivery 60 min" | **BLOCKS P0A** | AWAITING |
| 9.3 | **"Rated 4.9 on Google"** (appears twice) | **BLOCKS P0A** — **REQUIRES LEGAL** | AWAITING |
| 9.4 | **Five named testimonials** — Ravi Kumar (Hyderpora), Anita Sharma (Rajbagh), Mohammed Irfan (Lal Chowk), Deepa Nair (Nishat), Suresh Gowda (Bemina) | **BLOCKS P0A** — **REQUIRES LEGAL** | AWAITING — *fabricated quotes attributed to named individuals in named localities are actionable* |
| 9.5 | "Loved by thousands of builders & homeowners" | **BLOCKS P0A** | AWAITING — *the orders table is empty* |
| 9.6 | "100% genuine brands, sourced directly" | **BLOCKS P0A** | AWAITING — needs 3.4 |
| 9.7 | **App Store / Google Play badges** (currently `href="#"`) | **BLOCKS P0A** | AWAITING — *no app exists* |
| 9.8 | "Track deliveries live, reorder in one tap, app-only offers" | **BLOCKS P0A** | AWAITING |
| 9.9 | Services: "background-checked and skill-verified" | **BLOCKS P0A** — **REQUIRES LEGAL** | AWAITING |
| 9.10 | Services: "delay penalties written into every contract" | **BLOCKS P0A** — **REQUIRES LEGAL** | AWAITING — *this is a contractual commitment* |
| 9.11 | Services: "stage-wise quality checks with photo updates" | **BLOCKS P0A** | AWAITING — *no photo system exists* |
| 9.12 | "Free delivery for first 3 orders above ₹500" | **BLOCKS P0A** | AWAITING — *the coupon engine is dead code (ISS-011), so this cannot currently be honoured* |
| 9.13 | Series-A-style funding banner | **BLOCKS P0A** | AWAITING — *recommend removal* |
| 9.14 | Seeded product star ratings | BLOCKS P0B | AWAITING — *no review system exists (ISS-034)* |

## 10. Operational roles

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 10.1 | Who receives and confirms orders | **BLOCKS P0A** | The admin UI must match the people who exist | AWAITING |
| 10.2 | Who verifies stock, picks and packs | **BLOCKS P0A** | Determines whether pick lists are printed or on-screen, and on what device | AWAITING |
| 10.3 | Who assigns and dispatches | **BLOCKS P0A** | Determines whether a dispatch board is needed or one screen suffices | AWAITING |
| 10.4 | Who delivers — how many drivers, employed or contracted | **BLOCKS P0A** | `Driver` model design | AWAITING |
| 10.5 | Who confirms delivery and collects COD | **BLOCKS P0A** | POD and cash-collection design | AWAITING |
| 10.6 | Who handles failed delivery | BLOCKS P0B | Reattempt workflow | AWAITING |
| 10.7 | Who handles returns and refunds | BLOCKS P0B | Separation of duties — support requests, finance approves | AWAITING |
| 10.8 | How many admin users, and in what roles | BLOCKS P0B | RBAC design (ISS-027). The `Role` enum already exists and is unused. | AWAITING |

> **If one person performs all of 10.1–10.7, the admin should be one screen — not a
> dispatch board, a pick queue and a reconciliation ledger. The software must match the
> operation, not an imagined one.**

## 11. Customer segments and launch target

| # | Item | Blocking | Why | Status |
|---|---|---|---|---|
| 11.1 | Which segments are targeted in P0A | BLOCKS P0B | Informs merchandising and whether tier pricing is needed | AWAITING |
| 11.2 | Which segment is expected to drive most month-one revenue | DOES NOT BLOCK | Prioritisation | AWAITING |
| 11.3 | Desired launch date | DOES NOT BLOCK | Sequencing | AWAITING |
| 11.4 | Soft launch or public launch | DOES NOT BLOCK | Recommendation: soft launch for 30 days before any marketing | AWAITING |
| 11.5 | Expected orders/day and average order value | DOES NOT BLOCK | Capacity and cost modelling | AWAITING |
| 11.6 | Expected COD percentage | DOES NOT BLOCK | Working-capital planning | AWAITING |
| 11.7 | How many people will operate the system | BLOCKS P0B | RBAC and admin design | AWAITING |

---

## What is NOT blocked — engineering proceeds now

**None of the following requires owner input. Work on these while waiting.**

| Work | Issue |
|---|---|
| Production safety gate on the dummy payment gateway | ISS-002 |
| GST calculation **mechanics** (rates still needed, but the math and schema are ours) | ISS-001 |
| Move the Razorpay call out of the database transaction | ISS-003 |
| Warehouse-scoped inventory decrement | ISS-004 |
| Payment amount verification | ISS-005 |
| Commerce-critical test suite | ISS-013 |
| Error monitoring, uptime and alerting | ISS-012 |
| Canonical domain and sitemap configuration | ISS-018 |
| Order status transition enforcement | ISS-014 |
| Audit log | ISS-015 |
| Cart stock check on add | ISS-016 |
| Security headers and CSP | ISS-022 |
| CI pipeline | ISS-023 |
| Gate migrations out of the build step; set up staging | ISS-024 |
| Rate limiter fail-closed option for OTP | ISS-021 |
| Remove `lenis`, `gsap` and the welcome popup | ISS-031 |
| Search typo tolerance via `pg_trgm` | ISS-020 |
| Phone OTP **code** (the SMS provider account is separate) | ISS-006 |
| CSV import **pipeline** (the data is separate) | ISS-007 |
| Admin product CRUD **build** | ISS-019 |
| Fulfilment **schema and admin** (roles refine the UI, not the model) | ISS-009 |
| Repository hygiene — remove `.vercel-old/`, add Prettier | ISS-036 |

---

## Third-party accounts required

*Status only — **never paste a credential into a chat.** The owner sets these in Vercel.*

| Service | Purpose | Lead time | Blocking |
|---|---|---|---|
| **Razorpay** merchant | Payments | **3–7 days** | **BLOCKS P0A — start immediately** |
| **SMS provider** (MSG91 / Twilio) in Supabase | Phone OTP | **DLT registration 3–5 days** | **BLOCKS P0A — start immediately** |
| Sentry | Error monitoring | Instant | BLOCKS P0A |
| Google Business Profile | Local SEO, and a real Google rating to eventually replace the fabricated one | 1–2 weeks verification | DOES NOT BLOCK |
| Domain DNS access | Canonical domain, email | — | BLOCKS P0A |
| Uptime monitoring | Availability alerts | Instant | BLOCKS P0A |

---

## Answer log

*Record answers here as they arrive, with the date. Once an item is answered, update its
Status to `CONFIRMED` above and note where the value now lives in code or configuration.*

| Date | Item(s) | Answer | Recorded in |
|---|---|---|---|
| — | — | *Round 1 issued, awaiting response* | — |
