# G. Production-readiness dependency list

**Verdict (re-checked 4 Nov 2026): NOT READY for transactional commerce.** Production runs in
catalogue/enquiry mode at `www.verticalexpress.in` [L] and must stay there until every
**T-gate** below is green and the owner has signed. Catalogue mode itself has its own
smaller **C-gate** list, because it is already public.

Legend: ✅ met · 🟡 partial · ❌ not met · ⛔ blocked on owner, CA, legal or a third party

---

## 1. C-gates: what catalogue mode needs (it is live now)

| # | Gate | State | Evidence / action |
|---|---|---|---|
| C1 | Production refuses ordering (403 ORDERING_CLOSED). No payment configuration | ✅ | [C] `commerce-mode.ts`. [D] PR #25 |
| C2 | Only approved products and photos are visible, and in production only with attested licence codes | ✅ | [C] `approvedImageWhere`. HomeRun use is owner-authorised (17 Oct); its supporting licence documentation is not on file (DOC-01, a records gap, not a missing approval) |
| C3 | No price, stock, GST or ETA is shown | ✅ | [L] `pricePaise: null`, `purchasable: false` |
| C4 | Every visible CTA does something (no dead ends) | ❌ | GAP-C-05, GAP-P-01. Fix in P2 |
| C5 | The mobile app, if distributed, honours catalogue mode | ❌ | GAP-M-01 (no store build exists yet) |
| C6 | Production images in a production bucket | ❌ | GAP-I-01 |
| C7 | The deployed code comes from a reviewed, merged branch | 🟡 | [L4] Production's build matches merge commit `40f171c` (PR #25, merged 4 Nov) file for file, but it was uploaded from a local tree before the merge and is not built from git. GAP-R-01 |
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
| T7 | HomeRun images on sellable products: the owner's authorisation is recorded (17 Oct). The owner decides whether the supporting licence documentation must be on file before selling (DOC-01) | DOC-01 |

### Catalogue and inventory ⛔

| # | Dependency | State |
|---|---|---|
| T8 | MRP, selling price, SKU and variant name for every sellable SKU | ❌: 0 of 996 rows valid in the 2 Nov dry run. **No MRP verified for any product** |
| T9 | Pack/UoM and weight | ❌ OWNER 3.7, 3.8 |
| T10 | Opening stock per SKU and warehouse. Walk-in safety-stock rule | ❌ OWNER 5.1–5.4 |
| T11 | Launch category set matching **verified physical inventory** (a visible-product count is not stock evidence) | ❌ D-04, T10 |
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
| T18 | RC merged to `main` and production built from the merged commit | ❌ PR #24 open, held for owner approval (D-11). Production runs `40f171c`'s code; RC is at `3c66e59` |
| T19 | Real SMS OTP verified end to end on production. Firebase production environment variables set (ISS-053) | ❌ (EXT, owner) |
| T20 | Admin RBAC and audit log complete. **Mandatory: scheduled in roadmap phase P4b, before P5, not after it** | ❌ ISS-027 OPEN, ISS-015 PARTIAL |
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

## 4. Owner decisions

A decision blocks only the work named in its "Blocks" column. Everything else proceeds
(see `05-ROADMAP.md` §1, "Engineering that needs no owner decision"). The owner does not
need to answer all of these before work starts.

### 4.1 Already answered (recorded; not re-asked)

| Was | Answer | Date |
|---|---|---|
| Who approves the catalogue and images | The owner is the final approver of the catalogue and of every image | 4 Nov 2026 |
| Admin account for authenticated checks | The owner's existing verified admin account. None is to be created | 4 Nov 2026 |
| D-03 HomeRun images | **Authorised by the owner** (licence code `homerun-library-owner-licensed`): product photos only, each mapped and approved per photo; no HomeRun branding, logos, banners or copy. The supporting licence documentation is tracked separately as **DOC-01** below. It is a records gap, not a missing approval | 17 Oct 2026 |
| D-04, first half: what an empty category shows | `coming_soon`, kept reachable (no 404). PR #27 adds a working next action on those pages | 12 Oct 2026 |
| Operating mode | Catalogue/enquiry mode until the T-gates are met | 31 Oct 2026 |
| D-11, first half: release line | Local-only branches pushed and merged into the RC (PRs #29–#31). PR #25 merged into the RC. Stale PRs #3–#6 closed | 4 Nov 2026 |

### 4.2 Open decisions

| ID | Decision | Recommendation | Blocks | Does **not** block |
|---|---|---|---|---|
| **D-01** | Taxonomy: the canvas's 4 groups / 21 categories, or a 5th "Tools & Equipment" group (today the only categories containing visible products)? | Add **Tools & Equipment** as a 5th group so the canvas matches what is visible | The group/category order and naming part of P2 (AC-CAT-4) | PR #27; every independent item in `05` §1 |
| **D-02** | Level 3 (grade/type): structured attribute facets, or real subcategories (`parentId`)? | Attribute facets (additive, no URL change), starting with power tools | P2 L3 work (CAT-03, AC-CAT-5) and its migration | Everything else in P2 |
| **D-04** | Which categories launch **for sale** | Decide once opening stock is counted (T10) | T11, P4 | Catalogue mode (empty categories already handled per 12 Oct) |
| **D-05** | Prices GST-inclusive? Who supplies MRP and price, in what file? | GST-inclusive display; use the importer template (merged in #30) | P4 data load, T2, T8 | The importer, its validation and template (built) |
| **D-06** | Delivery promise, fees, threshold, pincodes, hours, slots | "Same day if ordered before a cut-off", no minute claims | P5, T13, T14 | — |
| **D-07** | COD at launch? Caps? | UPI-first soft launch; COD once reconciliation is staffed | COD work in P4b (only if yes), T15 | — |
| **D-08** | Returns and cancellation policy | — (legal) | T4; policy refunds in P4b if returns are offered at launch | — |
| **D-09** | Legal entity, address, phone, support email | — | C9, T1, P5 | — |
| **D-10** | Driver model: role in the customer app (as built) or a separate app; background location | Keep the role; location only during an active delivery | Driver device verification (T17) | — |
| **D-11** (rest) | Approve merging PR #24 (RC) into `main`, then a production rebuild from that merged commit. Decide PR #2 (image hand-off, draft) | Approve #24 after its CI is green on the current head; rebuild production from `main` through App Hosting, not a local upload | T18, closing GAP-R-01 | Work on feature branches into the RC |
| D-12 | Coupon FIRST3 (does nothing as configured), cashback rate, segment thresholds | Retire FIRST3 until there is a launch offer | P5 offers | — |
| D-13 | Services area: launch it or hide it (ISS-067) | Hide until the claims are verified | C8 | — |
| D-14 | Enquiry handling: who answers, through which channel, how fast | — | C10 | Enquiry inbox engineering (built) |
| D-15 | Admin roles for RBAC (OWNER 10.8): which roles, who holds each | Start with Owner (all), Catalogue, Dispatch, Finance | Role *assignment* in P4b | Building the RBAC mechanism with the owner as sole admin |
| D-16 | Production image bucket: approve creating it and copying the approved images (GAP-I-01) | Approve | P1.4, C6 | — |

### 4.3 Documents requested (not decisions)

| ID | Document | Why | Blocks |
|---|---|---|---|
| **DOC-01** | Supporting licence documentation for the HomeRun images: the underlying licence or written grant naming the asset set and permitted use | So the file holds the evidence behind the owner's recorded authorisation. Today the source folder holds only a saved web page with no licence notes | Nothing in catalogue mode. The owner decides whether it is required before HomeRun-sourced photos appear on sellable products (T7) |
