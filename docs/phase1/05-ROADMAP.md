# E. Engineering implementation roadmap

Each phase begins only once the owner approves it. Each one ends in a reviewable PR (or one PR
per slice), green CI, a staging deploy with screenshots compared against the artboards, and
an owner sign-off. **Nothing merges to `main` or deploys to production without the owner.**
Production stays in catalogue mode through P1–P4.

```
P0 Owner decisions ─┬─> P1 Consolidate & safeguard ─> P2 Browsing (#26) ─> P3 Quality pass ─┐
                    │                                                                         ├─> P5 Transactional launch
                    └─> Catalogue data (owner) ────────> P4 Catalogue fit-for-sale ───────────┘        (only after 07 gates)
                                                                                     P6 Operations closure (parallel to P5)
```

---

## P0: Owner decisions and data (no engineering)

Answer the decisions in `07` §4 needed for P1–P2: **D-01, D-02, D-03, D-04, D-11**.
Start the external lead-time items now: Razorpay live onboarding, SMS DLT, Play and App
Store developer accounts, the CA for GST/HSN, and legal for the policy pages.

## P1: Consolidate and safeguard (≈ 3–5 days)

*Goal: one true line of code, nothing at risk on one laptop, docs that tell the truth.*

| # | Work | Repo | Depends on |
|---|---|---|---|
| 1.1 | Push the local-only branches to `origin` as drafts (`mrp-equals-price`, `catalogue-update-import`, `transactional-launch-surfaces`) and commit `category-navigation-slice` | app | Owner OK (D-11) |
| 1.2 | Decide the merge order: PR #25 into the RC; RC (#24) into `main`. Close stale PRs #3–#6 as superseded | app | D-11 |
| 1.3 | **Mobile:** merge `claude/catalogue-mode-app` / `mobile-catalogue-enquiries` with `claude/location-first-address`. One mobile line that honours `orderingOpen` (GAP-M-01) | workspace | — |
| 1.4 | Production image bucket and copy of approved images (GAP-I-01) | infra | Owner bucket OK |
| 1.5 | Doc reconciliation: `CLAUDE.md` stack table and priorities; record the three owner decisions in `OWNER_INPUT_REQUIRED.md`; one `KNOWN_ISSUES.md` status pass | app | — |
| 1.6 | Minimal browser end-to-end smoke (Playwright, anonymous journeys only) against staging in CI or a nightly job | app | — |

## P2: Category, listing and PDP browsing (owned by the issue #26 cloud session)

*This audit does not re-plan #26. These are the requirements it must meet; see `06` §2.*

- Truthful L1 and L2 on web and mobile. Every displayed category either lists products or gives an honest next step (enquire, or the nearest stocked category). No dead CTA (GAP-C-05, GAP-P-01).
- Taxonomy per D-01. L3 grade/type navigation per D-02. If D-02 is "attribute facets", it needs a structured attribute key per category, an additive migration and an admin field.
- Listing: correct first page, reliable load-more, position kept on back, price controls only where products are priced (GAP-L-01 to L-04).
- Tiles for the launched categories (GAP-C-04), alt text (GAP-A-01).
- Tests: directory states 0/1/many, unapproved exclusion, route transitions, desktop and mobile rendering, search facets, slow network.

**Coordination rule:** P1 items 1.3 and 1.5 touch files #26 may also touch (mobile
category screens, docs). They go after #26 lands, or in agreement with that session.

## P3: Cross-surface quality pass (≈ 1–2 weeks)

- States: loading, error with retry, and empty on every list (web and mobile); skeletons where the UI designer approves (the canvas draws none).
- Performance: lazy-load below the fold, `sizes`/`srcset`, image budget on home, LCP on a throttled mid-tier profile (GAP-PF-01).
- Accessibility: axe checks in CI on key routes, focus order, 44 px targets, contrast (ISS-039).
- Visual parity: screenshot each artboard against its route at 380 px and 1440 px, and log the diffs.
- Authenticated verification: the owner provides a staging customer and an admin test account, then account and ops pages are rendered (GAP-T-02).
- First device run on a physical Android mid-tier handset (EXT).

## P4: Catalogue fit for sale (driven by owner data)

- Owner supplies MRP, selling price, SKU, variant name, pack/UoM, weight and HSN/GST per sellable SKU. Engineering supplies the template and the validated import (`catalogue-update-import`).
- Dry run until 0 invalid, owner reviews the diff, apply on staging, commercial review in `/admin/catalogue-approvals`.
- Opening stock per SKU and warehouse (OWNER 5.x), plus a low-stock threshold.
- Launch category set (D-04) aligned with the stock that actually exists.

## P5: Transactional launch (only when every `07` gate is green)

- Razorpay live keys set by the owner in Secret Manager. Switch the production config to `COMMERCE_MODE=transactional` in a reviewed PR.
- Delivery policy (fees, threshold, pincodes, hours) entered via admin settings.
- Legal pages final. Invoices per the CA-approved format.
- Soft launch (recommended 30 days), with a rollback that is one config flip back to catalogue mode.

## P6: Operations closure (parallel with P5)

- RBAC roles (ISS-027) and audit-log completeness (ISS-015).
- COD: caps, collection in driver mode, reconciliation (ISS-010), only if D-07 says COD launches.
- Driver: failed-delivery and reattempt, device-verified POD.
- Policy refunds and returns once D-08 is decided.
- Monitoring: Sentry DSN on production, uptime checks, alert routing.

## Explicitly not in this roadmap

Anything in `CLAUDE.md` "Do Not Build Yet". The estimator, named saved lists, notifications,
trade credit and trending search stay out until their owner decisions are made.
