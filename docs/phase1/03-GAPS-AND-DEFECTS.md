# C. Missing-features and defects register

New findings from this audit are prefixed `GAP-`. Existing issues keep their `ISS-` number
from `docs/KNOWN_ISSUES.md`, which stays the canonical defect log. Once the owner approves
this register, the `GAP-` rows should be copied into `KNOWN_ISSUES.md`.

**Severity:** CRITICAL (money, law or data exposure) · HIGH (blocks launch or a core
journey) · MEDIUM (undermines confidence) · LOW (quality).
**Owner:** ENG (engineering can act) · OWNER (business input) · CA/LEGAL · EXT (third party).

---

## 1. New findings (3 Nov 2026)

| ID | Sev | Area | Finding | Evidence | Owner | Phase |
|---|---|---|---|---|---|---|
| GAP-C-01 | HIGH | Categories | **19 of 23 live categories are empty (`coming_soon`)**. Only `general-hardware-tools` (4 products) among the original 20 has stock. 256 of the 260 visible products sit in 3 "tools" categories that are not on the canvas. This is the root of "categories feel unfinished" | [L] `/api/v1/categories` on www | OWNER (catalogue data) + ENG (presentation, #26) | P1/P2 |
| GAP-C-02 | HIGH | Taxonomy | The canvas defines **4 groups / 21 categories**. Production serves **5 display groups** (an extra `tools_equipment`, mapped in code onto the `tools` enum) **/ 23 categories** | [L][C] | OWNER (D-01) | P2 |
| GAP-C-03 | HIGH | Taxonomy | No level-3 subcategory ("Shop by grade/type"). `Category` has no parent, and product attributes are free-form, so the facets drawn (grade, size, finish, room) cannot be built honestly | [C] `prisma/schema.prisma` | OWNER (D-02) + ENG | P2 |
| GAP-C-04 | MEDIUM | Imagery | The 3 populated categories (`power-tools`, `outdoor-agriculture-equipment`, `spare-parts-accessories`) have **no tile image** | [L] `imageUrl` null | OWNER (asset approval) + ENG | P2 |
| GAP-C-05 | MEDIUM | Home | Home hero CTAs "Shop tiling" and "Shop electricals" lead to empty categories | [S] | ENG (local fix on `claude/category-navigation-slice`, uncommitted) | P2 |
| GAP-L-01 | MEDIUM | Listing | First page shows 24 of N, and infinite scroll adds pages slowly (120 of 202 after six scrolls) | [S] | ENG | P2 |
| GAP-L-02 | MEDIUM | Listing | Back from a PDP resets the listing to the first page and the top | [S] | ENG | P2 |
| GAP-L-03 | MEDIUM | Listing | Price sort and price-range filters are offered on listings where no product is priced, so they do nothing visible | [S] | ENG (local fix pending) | P2 |
| GAP-L-04 | LOW | API | `/api/v1/products` reads `perPage` and silently ignores `limit` (default cap 20) | [S] | ENG (document or accept both) | P2 |
| GAP-P-01 | HIGH | PDP | Mobile-web sticky bottom bar shows "Price on request" **with no control**, so a phone user has no next step | [S] | ENG | P2 |
| GAP-M-01 | **CRITICAL for any app release** | Mobile | Catalogue-mode handling (no cart, enquiry, ORDERING_CLOSED treated as final) is on workspace branch `claude/catalogue-mode-app` and **is not in** the current mobile branch `claude/location-first-address`. A build from the current branch would show a cart that production refuses | [C] `grep orderingOpen mobile/src` returns nothing on the current branch | ENG | P1 |
| GAP-R-01 | HIGH | Release | Production (`ve-production`, now serving www) was deployed from **draft PR #25**, not from a merged release branch. `main` is 316 commits behind the RC | [C][L] | OWNER + ENG (D-11) | P1 |
| GAP-R-02 | HIGH | Release | Work exists only on the owner's Mac: `claude/mrp-equals-price`, `claude/catalogue-update-import`, `claude/transactional-launch-surfaces` (unpushed), plus uncommitted edits in `claude/category-navigation-slice`. A disk failure loses it | [C] `git ls-remote` | OWNER (approve push) + ENG | P1 |
| GAP-R-03 | LOW | Release | **Checked, and resolved.** All 18 pushed fix and feature branches have 0 commits outside the RC, including Next 15.5.28, runtime deps, outbox, refund replay, ISS-096, ISS-097, `feat/admin-catalogue`, `feat/refund-execution`, `feat/monitoring` and the inventory ledger. `KNOWN_ISSUES.md` still describes many of them as "not in the RC" | [C] `git rev-list --count` | ENG (register update) | P1 |
| GAP-R-04 | LOW | Release | Open PRs #3, #4, #5 and #6 (16–17 Oct) target branches whose commits are already in the RC. They are stale and should be closed as superseded once the owner agrees. PR #2 (image hybrid handoff, draft) needs a decision | [C] | OWNER + ENG | P1 |
| GAP-I-01 | HIGH | Images | **Production reads the staging image bucket** (`ve-staging-product-images`) | [L] product `imageUrl`. PR #25 | ENG + OWNER (bucket) | P1 |
| GAP-I-02 | HIGH | Licence | The HomeRun "licence" is an owner statement (17 Oct, in writing). **No licence instrument exists in the repo**. The source folder is a browser "save page" of HomeRun's home page, with "no licence documents or source notes". 35 photos were relicensed under the code, and 15 repo category composites match HomeRun by perceptual hash | [D] workspace `docs/catalog/homerun-production-images-2026-10-17/README.md` | OWNER (D-03) | P0 gate |
| GAP-A-01 | MEDIUM | A11y | Category tile images have empty `alt` | [S] | ENG | P2 |
| GAP-PF-01 | MEDIUM | Performance | Staging home requests all 27 images at a 393 px viewport | [S] | ENG | P3 |
| GAP-D-01 | MEDIUM | Docs | `CLAUDE.md` is stale on hosting (Vercel), mobile (Capacitor), model and migration counts, and the priority table. `OWNER_INPUT_REQUIRED.md` has no recorded answers despite three written owner decisions | [C] | ENG (doc PR) | P1 |
| GAP-T-01 | MEDIUM | QA | No end-to-end browser or device test suite (no Playwright, Detox or Maestro). CI runs typecheck, lint, unit/service, UI, design-system and asset checks only | [C] `.github/workflows/ci.yml` | ENG | P1–P3 |
| GAP-T-02 | MEDIUM | QA | Nothing has been device-verified. Ops pages are source-audited only, never rendered with an admin login | [D] parity matrix | EXT (device) + OWNER (admin test account) | P3 |

## 2. Open issues carried from `KNOWN_ISSUES.md`

| ISS | Sev | Title | Status | Owner |
|---|---|---|---|---|
| 007 | HIGH | Catalogue: launch set, real brands, SKUs | BLOCKED | OWNER |
| 008 | HIGH | Fabricated public claims | BLOCKED | OWNER/LEGAL |
| 010 | HIGH | COD collection and reconciliation | OPEN | OWNER + ENG |
| 012 | MEDIUM | Monitoring, uptime, analytics | PARTIAL | ENG |
| 014 | MEDIUM | Order transition enforcement | OPEN (re-check; `lib/order-flow.ts` exists) | ENG |
| 015 | MEDIUM | Audit log on money, stock, price | OPEN (re-check; `AuditLog` model exists) | ENG |
| 017 | HIGH | Legal pages | BLOCKED | LEGAL |
| 018 | MEDIUM | Canonical URLs and sitemap host | OPEN (verify on www) | ENG |
| 020 | LOW | Search typo tolerance | OPEN | ENG |
| 024 | MEDIUM | Migrations on deploy | OPEN in the register, but `CLAUDE.md` says migrations are manual; reconcile | ENG |
| 025 | HIGH | Refunds (policy refunds) | PARTIAL | OWNER |
| 026 | CRITICAL | GST invoice | BLOCKED | CA |
| 027 | HIGH | Admin RBAC | OPEN | OWNER (roles) + ENG |
| 039 | LOW | Amber body text contrast | OPEN | ENG |
| 044/045 | MEDIUM | Branded imagery residuals; a missing fan tile file | PARTIAL | ENG |
| 047 | HIGH | OTP abuse protection | PARTIAL | ENG |
| 053 | HIGH | Production Firebase auth environment | OPEN | OWNER |
| 057 | HIGH | Delivery slots | OPEN | OWNER + ENG |
| 058 | LOW | Default sort | PARTIAL | OWNER |
| 060 | LOW | Search query log | OPEN | OWNER |
| 062 | MEDIUM | Product cost not recorded | OPEN | OWNER |
| 067 | MEDIUM | Services UI claims | OPEN | OWNER |
| 086 | CRITICAL (at sale) | Cement taxed at 28% (statutory 18% since 22 Sep 2025, per the register) | OPEN | OWNER/CA |
| 089 | MEDIUM | Real SMS OTP unverified | PARTIAL | EXT |

Entries marked "local only / not committed" in the register (ISS-068 to ISS-088) need
confirming against the RC. The register needs one reconciliation pass (P1).

## 3. Missing features (no model or no build), by owner dependency

| Feature | Blocked by | Notes |
|---|---|---|
| Subcategory / grade navigation | D-02 + attribute data | Largest browsing gap |
| Delivery slots | Owner slot policy | Model design follows the policy |
| Notifications (push/SMS/WhatsApp/in-app) | Owner channel decision | No model |
| Named saved lists | Owner scope | Wishlist exists |
| Request-this-item | Owner process | — |
| Trending searches | Data-retention decision | — |
| Genuineness / batch verification | Ops process | — |
| Driver failed-delivery and reattempt | OWNER 10.6 | — |
| Support tickets | Channel decision | — |
| Trade credit | Product decision | DEFERRED |
| Estimator | Owner-approved ratios | DEFERRED to P1 |
| Store-distributed mobile app | Developer accounts, listing, privacy policy | — |
