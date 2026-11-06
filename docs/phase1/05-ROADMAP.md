# E. Engineering implementation roadmap

*Corrected 4 Nov 2026.* Every slice ends in a reviewable PR into the RC, green CI, a staging
deploy with screenshots compared against the artboards, and owner review. **Nothing merges
to `main` or deploys to production without the owner.** Production stays in catalogue mode
until P5.

Owner decisions gate only the work that depends on them (`07` §4.2 lists what each one
blocks and what it does not). Work that needs no decision starts without waiting for the
others.

```
Independent engineering (§1) ──────────────┐
P1 Consolidate & safeguard (mostly done) ──┤
P2 Browsing (#26 / PR #27) ── D-01, D-02 ──┼─> P3 Quality pass ─┐
Owner catalogue data ── D-04, D-05 ────────┴─> P4 Catalogue fit-for-sale ─┤
                                              P4b Launch-mandatory controls ─┴─> P5 Transactional launch
                                                 (RBAC, audit, monitoring,        (only when every 07 T-gate
                                                  restore drill, …)                is green and the owner signs)
                                                                                   P6 Post-launch operations
```

---

## 1. Engineering that needs no owner decision

These can be picked up now, each as its own PR into the RC. None of them changes a business
value, enables checkout, touches the production database, or deploys.

| # | Work | Phase | Notes |
|---|---|---|---|
| I-1 | **Mobile catalogue mode**: bring `claude/catalogue-mode-app` / `claude/mobile-catalogue-enquiries` into `claude/location-first-address` (GAP-M-01) | P1.3 | Coordinate with PR #27 on the mobile category screens it changes |
| I-2 | **RBAC mechanism** (ISS-027): role model, server-side checks on every `/api/admin/*` route, the owner as sole admin until D-15 assigns roles | P4b | Additive migration, applied to staging only |
| I-3 | **Audit-log completeness** (ISS-015): every money, stock, price and approval action writes `AuditLog` | P4b | Re-check what `AuditLog` already covers first |
| I-4 | **Order transition enforcement** re-check (ISS-014, `lib/order-flow.ts`) | P4b | Close or narrow the register entry |
| I-5 | Monitoring: Sentry DSN wiring check, uptime check and alert route documented (T22) | P4b | Alert *recipient* is the owner's to name |
| I-6 | Restore drill from a backup onto a scratch database (T23) | P4b | Never against production |
| I-7 | Wire the Playwright smoke (#33, manual dispatch today) to run nightly against staging; add axe checks | P3 | |
| I-8 | Performance: lazy loading below the fold and `sizes`/`srcset` on home (GAP-PF-01) | P3 | Outside #27's files |
| I-9 | `KNOWN_ISSUES.md`: confirm ISS-068 to ISS-088 against the RC and update statuses | P1 | Docs only |

## P0: Owner decisions and data

Answer the decisions in `07` §4.2 **as they become relevant**, not all at once. The ones that
unblock the most work soonest are **D-01** and **D-02** (P2 taxonomy and L3), **D-11** (PR #24
into `main`) and **D-16** (production image bucket). Start the external lead-time items now:
Razorpay live onboarding, SMS DLT, Play and App Store developer accounts, the CA for
GST/HSN, and legal for the policy pages.

## P1: Consolidate and safeguard

*Goal: one true line of code, nothing at risk on one laptop, docs that tell the truth.*

| # | Work | State (4 Nov) |
|---|---|---|
| 1.1 | Push the local-only branches | **Done**: merged into the RC as PRs #29, #30, #31. `claude/category-navigation-slice` has no commits and its worktree is gone; its scope belongs to PR #27 |
| 1.2 | Merge order: PR #25 into the RC; RC (#24) into `main`; close stale PRs #3–#6 | #25 **merged** (`40f171c`). #3–#6 **closed**. #24 **open, held** for owner approval (D-11) |
| 1.3 | Mobile: one line that honours `orderingOpen` (GAP-M-01) | Open (I-1) |
| 1.4 | Production image bucket and copy of approved images (GAP-I-01) | Open, needs D-16 |
| 1.5 | Doc reconciliation: `CLAUDE.md`, `OWNER_INPUT_REQUIRED.md` answer log, `KNOWN_ISSUES.md` | **Done** in PR #32, except the ISS-068–088 pass (I-9) |
| 1.6 | Browser end-to-end smoke (Playwright, anonymous journeys) | **Added** in PR #33 as a manually dispatched workflow. Scheduling it is I-7 |
| 1.7 | Rebuild production from the merged commit on `main` through App Hosting rather than a local upload (GAP-R-01) | After D-11. Not part of this task |

## P2: Category, listing and PDP browsing (owned by issue #26 / PR #27)

*This roadmap does not re-plan #26 and does not edit PR #27's files. These are the
requirements it must meet; see `06` §2.*

- Truthful L1 and L2 on web and mobile. Every displayed category either lists visible products or gives an honest next step (enquire, or the nearest category with visible products). No dead CTA (GAP-C-05, GAP-P-01).
- Taxonomy per D-01. L3 grade/type navigation per D-02. If D-02 is "attribute facets", it needs a structured attribute key per category, an additive migration and an admin field. **Only these two items wait for the decisions; the rest of P2 does not.**
- Listing: correct first page, reliable load-more, position kept on back, price controls only where products are priced (GAP-L-01 to L-04).
- Tiles for the categories that contain visible products (GAP-C-04), alt text (GAP-A-01). Tile art goes to the owner for approval.
- Tests: directory states 0/1/many, unapproved exclusion, route transitions, desktop and mobile rendering, search facets, slow network.

**Coordination rule:** I-1 (mobile) and I-9 (docs) touch areas PR #27 may also touch. Check
PR #27's file list first, and land after it or by agreement with that session.

## P3: Cross-surface quality pass

- States: loading, error with retry, and empty on every list (web and mobile); skeletons where the UI designer approves (the canvas draws none).
- Performance (I-8) and LCP on a throttled mid-tier profile.
- Accessibility: axe checks on key routes (I-7), focus order, 44 px targets, contrast (ISS-039).
- Visual parity: screenshot each artboard against its route at 380 px and 1440 px, and log the diffs.
- Authenticated verification: ops and account pages rendered on staging using the **owner's existing verified admin account**, in a session the owner signs in to. No new admin account is created (GAP-T-02).
- First device run on a physical Android mid-tier handset (EXT).

## P4: Catalogue fit for sale (driven by owner data)

- Owner supplies MRP, selling price, SKU, variant name, pack/UoM, weight and HSN/GST per sellable SKU (D-05). Engineering supplies the template and the validated import (merged in #30).
- Dry run until 0 invalid, owner reviews the diff, apply on staging, commercial review by the owner in `/admin/catalogue-approvals`.
- Opening stock per SKU and warehouse from a **physical count** (OWNER 5.x), plus a low-stock threshold. Visible-product counts are not used as stock.
- Launch category set (D-04) aligned with the verified stock.

## P4b: Launch-mandatory controls (must be complete before P5)

Everything the `07` T-gates require from engineering is done here, **before** the
transactional launch, not after it.

| Work | Gate | Depends on |
|---|---|---|
| RBAC: mechanism (I-2), then role assignment | T20, ISS-027 | Mechanism: none. Assignment: D-15 |
| Audit log on money, stock, price and approvals (I-3) | T20, ISS-015 | — |
| Order transition enforcement confirmed (I-4) | T20 (supporting) | — |
| Sentry on production, uptime monitor, alert recipient (I-5) | T22 | Recipient named by the owner |
| Restore drill (I-6) | T23 | — |
| Production Maps browser key | T24 | Owner creates the key |
| Browser E2E, accessibility and performance gates green | T25 | I-7 |
| Rollback to `COMMERCE_MODE=catalogue` rehearsed on staging | T26 | — |
| Real SMS OTP end to end, Firebase production variables (ISS-053) | T19 | Owner (EXT) |
| COD caps, collection in driver mode, reconciliation (ISS-010) | T15 | **Only if** D-07 says COD launches |
| Policy refunds and returns | T4 | **Only if** D-08 offers returns at launch |
| Driver mode device-verified | T17 | D-10, a handset |

## P5: Transactional launch (only when every `07` T-gate is green and the owner signs)

- Razorpay live keys set by the owner in Secret Manager. Switch the production config to `COMMERCE_MODE=transactional` in a reviewed PR.
- Delivery policy (fees, threshold, pincodes, hours) entered via admin settings (D-06).
- Legal pages final. Invoices per the CA-approved format.
- Soft launch (recommended 30 days), with a rollback that is one config flip back to catalogue mode.

## P6: Post-launch operations (nothing here is a launch gate)

- Driver failed-delivery and reattempt (OWNER 10.6), unless the owner makes it a launch gate.
- COD, if D-07 defers it past launch.
- Reporting and BI pages that have no data model behind them yet.

## Explicitly not in this roadmap

Anything in `CLAUDE.md` "Do Not Build Yet". The estimator, named saved lists, notifications,
trade credit and trending search stay out until their owner decisions are made.
