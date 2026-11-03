# G. Production-readiness dependency list

**Verdict (3 Nov 2026): NOT READY for transactional commerce.** Production runs in
catalogue/enquiry mode at `www.verticalexpress.in` [L] and must stay there until every
**T-gate** below is green and the owner has signed. Catalogue mode itself has its own
smaller **C-gate** list, because it is already public.

Legend: ✅ met · 🟡 partial · ❌ not met · ⛔ blocked on owner, CA, legal or a third party

---

## 1. C-gates: what catalogue mode needs (it is live now)

| # | Gate | State | Evidence / action |
|---|---|---|---|
| C1 | Production refuses ordering (403 ORDERING_CLOSED). No payment configuration | ✅ | [C] `commerce-mode.ts`. [D] PR #25 |
| C2 | Only approved products and photos are visible, and in production only with attested licence codes | ✅ (code) / ⛔ (HomeRun scope) | IMG-0, D-03 |
| C3 | No price, stock, GST or ETA is shown | ✅ | [L] `pricePaise: null`, `purchasable: false` |
| C4 | Every visible CTA does something (no dead ends) | ❌ | GAP-C-05, GAP-P-01. Fix in P2 |
| C5 | The mobile app, if distributed, honours catalogue mode | ❌ | GAP-M-01 (no store build exists yet) |
| C6 | Production images in a production bucket | ❌ | GAP-I-01 |
| C7 | The deployed code comes from a reviewed, merged branch | ❌ | GAP-R-01: deployed from draft PR #25 |
| C8 | No fabricated public claims (ratings, testimonials, "60 min", "authorised") | 🟡 | ISS-008. Most were removed. Owner must confirm the remainder (OWNER §9) |
| C9 | Legal pages good enough for enquiry capture (privacy notice covers enquiry personal data) | ⛔ | ISS-017, legal |
| C10 | Enquiries reach a named person, and the response time is owned | ⛔ | Owner process |
| C11 | Monitoring: errors and uptime alert someone | 🟡 | ISS-012 |
| C12 | Backup taken, restore procedure written | 🟡 | `pg_dump` before the production copy [D]. No restore drill |

## 2. T-gates: required before taking money

### Business and legal ⛔

| # | Dependency | Owner ref |
|---|---|---|
| T1 | Registered legal entity, address, phone, support email | OWNER 1.1–1.5 |
| T2 | GSTIN. Are prices GST-inclusive? Per-category GST rate and HSN (including cement 18% vs 28%, ISS-086) | OWNER 2.1–2.4, CA |
| T3 | CA-approved tax invoice format | OWNER 2.5, ISS-026 |
| T4 | Terms, privacy, refund, shipping and cancellation policies, reviewed by a lawyer | ISS-017, OWNER 7.8, 8.1, 8.2 |
| T5 | Razorpay **live** merchant account approved, with keys in Secret Manager | OWNER 7.1 |
| T6 | Brand authorisation evidence for any "genuine" or "authorised" claim | OWNER 3.4 |
| T7 | HomeRun image licence instrument (or removal of those images from sellable products) | D-03 |

### Catalogue and inventory ⛔

| # | Dependency | State |
|---|---|---|
| T8 | MRP, selling price, SKU and variant name for every sellable SKU | ❌: 0 of 996 rows valid in the 2 Nov dry run. **No MRP verified for any product** |
| T9 | Pack/UoM and weight | ❌ OWNER 3.7, 3.8 |
| T10 | Opening stock per SKU and warehouse. Walk-in safety-stock rule | ❌ OWNER 5.1–5.4 |
| T11 | Launch category set matching real stock | ❌ D-04 |
| T12 | Owner commercial review recorded per product | ❌ (needs T8) |

### Delivery and operations ⛔

| # | Dependency | State |
|---|---|---|
| T13 | Launch pincodes, delivery fees, free-delivery threshold, operating hours | ❌ OWNER 6.1–6.6 |
| T14 | Delivery promise wording (no unverified "60 min") and slot policy if slots are used | ❌ OWNER 6.3, ISS-057 |
| T15 | COD: yes or no. If yes: caps, first-order cap, collector, reconciliation | ❌ OWNER 7.3–7.7, ISS-010 |
| T16 | Named people for order intake, picking, dispatch, delivery, failed delivery and refunds | ❌ OWNER 10.x |
| T17 | Driver roster and devices. Driver mode device-verified | ❌ |

### Engineering and infrastructure

| # | Dependency | State |
|---|---|---|
| T18 | RC merged to `main` and production built from the merged commit | ❌ D-11 |
| T19 | Real SMS OTP verified end to end on production. Firebase production environment variables set (ISS-053) | ❌ (EXT, owner) |
| T20 | Admin RBAC and audit log complete | ❌ ISS-027, ISS-015 |
| T21 | Payment flows re-verified with live keys at a small real amount, then refunded | ❌ (needs T5) |
| T22 | Sentry DSN on production, uptime monitor, alert recipient | 🟡 |
| T23 | Restore drill from backup on a scratch database | ❌ |
| T24 | Production Maps browser key (PR #25 "not done") | ❌ |
| T25 | Browser E2E, accessibility and performance gates green (see `06`) | ❌ (not built) |
| T26 | Rollback: one reviewed config change back to `COMMERCE_MODE=catalogue`, rehearsed on staging | 🟡 (mechanism exists) |

## 3. External lead times (start now)

| Item | Lead time |
|---|---|
| Razorpay live onboarding | 3–7 days after documents |
| SMS DLT registration (India) | 3–5 days |
| CA: GST/HSN schedule and invoice format | owner-dependent |
| Lawyer: policies | owner-dependent |
| Google Play / Apple developer accounts and store review | 1–14 days |
| Google Business Profile (for any future rating claim) | 1–2 weeks |

## 4. Decisions requiring owner approval

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| **D-01** | Taxonomy: the canvas's 4 groups / 21 categories, or add a 5th "Tools & Equipment" group (today's only stocked categories)? | Add a 5th group, **Tools & Equipment**, to the canvas so that it matches real stock, and hide empty groups from navigation until stocked | P2 |
| **D-02** | Level 3 (grade/type): structured attribute facets per category, or real subcategories (`parentId`)? | Attribute facets (additive, no change to URLs), starting with power tools, where the stock is | P2 |
| **D-03** | HomeRun images: supply the licence instrument and its scope | Until it arrives, no new HomeRun images, and review the 35 already relicensed | P2, T7 |
| **D-04** | Which categories launch, and what an empty category shows (hidden, or "coming soon" with enquiry) | Hide categories with 0 products from Home and the nav. Keep their URLs live with an enquiry action | P2 |
| **D-05** | Prices GST-inclusive? Who supplies MRP and price, and in what file? | GST-inclusive display. Use the importer template | P4 |
| **D-06** | Delivery promise, fees, threshold, pincodes, hours, slots | Launch with "same day if ordered before a cut-off", no minute claims | P5 |
| **D-07** | COD at launch? Caps? | UPI-first soft launch, COD later once reconciliation is staffed | P5/P6 |
| **D-08** | Returns and cancellation policy | — (legal) | P5 |
| **D-09** | Legal entity, address, phone, support email | — | C9, P5 |
| **D-10** | Driver model: a role in the customer app (as built) or a separate app; background location | Keep the role in the app. Location only during an active delivery | P6 |
| **D-11** | Release line: approve pushing local-only branches, merging PR #25 into the RC, the RC into `main`, and closing stale PRs #3–#6 | Approve, in that order, each through a reviewed PR | P1 |
| D-12 | Coupon FIRST3 (does nothing as configured), cashback rate, segment thresholds | Retire FIRST3 until there is a launch offer | P5 |
| D-13 | Services area: launch it or hide it (ISS-067) | Hide until the claims are verified | C8 |
| D-14 | Enquiry handling: who answers, through which channel, and how fast | — | C10 |
