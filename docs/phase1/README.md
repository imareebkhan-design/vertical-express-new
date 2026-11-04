# Phase 1 — Discovery, audit and PRD (3 November 2026, corrected 4 November 2026)

This folder contains the documents only. No application code, database, hosting or
production setting was changed to produce it.

**What waits for the owner, and what does not.** An owner decision gates only the work
that depends on it. Engineering that needs no business value or decision (listed in
`05-ROADMAP.md` §1) can proceed through the normal review path: feature branch, PR, green
CI, staging screenshots. Nothing is merged to `main` or deployed to production without the
owner's approval, and production stays in catalogue/enquiry mode.

**Corrections of 4 November 2026.** At the owner's request this set was corrected for:
release facts that went stale when PR #25 merged; "stocked" used where the evidence shows
only that products are publicly visible; RBAC and audit work that was scheduled after the
transactional launch although it is a launch gate; owner decisions that were described as
open; and a sequencing that required every decision before any work.

| # | Document | What it answers |
|---|---|---|
| A | [01-MASTER-PRD.md](01-MASTER-PRD.md) | What we are building, for whom, every requirement and its status |
| B | [02-SCREEN-MATRIX.md](02-SCREEN-MATRIX.md) | Each of the 68 canvas artboards against the running code |
| C | [03-GAPS-AND-DEFECTS.md](03-GAPS-AND-DEFECTS.md) | Missing features and defects, with their severity and owner |
| D | [04-ASSET-INVENTORY.md](04-ASSET-INVENTORY.md) | Every image source, its licence position, and the rules for adding images |
| E | [05-ROADMAP.md](05-ROADMAP.md) | Implementation phases, their order, and what each depends on |
| F | [06-ACCEPTANCE-AND-TESTING.md](06-ACCEPTANCE-AND-TESTING.md) | Acceptance criteria per area, and the test strategy |
| G | [07-PRODUCTION-READINESS.md](07-PRODUCTION-READINESS.md) | What must be true before production can take money |

## Evidence baseline

Every status in these documents was established against one of the following sources, and
each claim says which one it relies on:

| Tag | Source | Date |
|---|---|---|
| **[C]** | Code on `origin/release/rc-2026-10-19` @ `06d19d7` (the app). Mobile: workspace branch `claude/location-first-address` @ `36d8fb8` | 3 Nov 2026 |
| **[L]** | Live HTTP probe of `www.verticalexpress.in` (production), `ve-production--…hosted.app` and `ve-staging--…hosted.app` | 3 Nov 2026 |
| **[D]** | A claim made in a repository document or PR body that this audit did not re-verify | as dated |
| **[S]** | Staging browser observations recorded earlier on 3 Nov 2026 (listing, sort, PDP) | 3 Nov 2026 |
| **[L4]** | Re-probe of `www.verticalexpress.in`, plus the Firebase App Hosting build, rollout and traffic records of `ve-production`, and its uploaded source archive compared file by file with git | 4 Nov 2026 |

**What "visible" means here.** A product count in these documents is the number of
products the public API returns (approved identity and photo, active brand and category).
It is **not** evidence of physical inventory. No stock count has been verified for any
product. Where these documents say a category "has products", they mean it contains
visible products, nothing more.

**Old documentation compared with current code.** `main` in both repositories is stale.
In the app it is the August Prisma 7 merge. The real head is `release/rc-2026-10-19`
(`3c66e59` on 4 Nov; PR #24 into `main` is open and **not merged**). Several documents
that call themselves authoritative had drifted. The three app-repo items below were
reconciled on 4 Nov by PR #32 (merged into the RC); they are kept here as the 3 Nov finding:

- `CLAUDE.md` (the app's operating manual) still says hosting is Vercel, mobile is
  Capacitor, and the schema has 37 models and 15 migrations. The code has Firebase App
  Hosting, an Expo app, 48 models and 39 migrations. Its "Current Priorities" table lists
  ISS-001 to ISS-005 as open, but `KNOWN_ISSUES.md` records all five as FIXED on 25 Aug.
- `docs/OWNER_INPUT_REQUIRED.md` says every item is AWAITING and that the code "adds 18%
  on top". The GST defect is fixed. Its answer log is empty, yet three owner decisions were
  made in writing elsewhere: catalogue mode, `coming_soon` empty categories (12 Oct) and the
  HomeRun image licence exception (17 Oct). Nobody recorded them there.
- The workspace `docs/UI_PARITY_MATRIX.md` and the two `ARTIFACT_*` manifests date from
  23 Sep and describe mobile `main`-era code. Issue #26 places them in the app repo, but they
  are in the **workspace** repo.
- Many `KNOWN_ISSUES.md` entries (ISS-068 to ISS-088) say "local only, not committed". Most
  of them are now in the release branch. Each one still needs to be confirmed against the
  branch before it is closed.

## Release facts (verified 4 Nov 2026)

| Fact | Evidence |
|---|---|
| PR #25 (production backend, catalogue mode) **merged** into the RC on 4 Nov 2026 at 05:22 UTC as merge commit `40f171c` | GitHub |
| Production `ve-production` serves **build `build-2026-11-02-002`** at 100% of traffic. It was created 2 Nov 22:01 UTC (3 Nov 03:31 IST) and has not been replaced | [L4] App Hosting rollouts and traffic |
| That build was **uploaded from a local working tree, not built from git** (the backend has no connected repository; the source is a zip archive). Its application code is identical, file for file, to commit `43cbe3d`, whose tree is the same as merge commit `40f171c`. The only differences are files the upload skips (`.env*.example`, `.vercel-old/`, `mobile-shell/`) and `docs/DEPLOY_FIREBASE.md`, which was edited after the upload | [L4] archive compared with git |
| So production runs the code of `40f171c` (the PR #25 merge), but the RC has since moved on by PRs #29, #30, #31, #32 and #33 (to `3c66e59`). **None of those are deployed** | [C] |
| `www.verticalexpress.in` returns 200 and the apex 301-redirects to www. Production lists 23 categories and 260 visible products; 4 categories contain visible products (`power-tools` 202, `outdoor-agriculture-equipment` 39, `spare-parts-accessories` 15, `general-hardware-tools` 4) | [L4] |
| PR #24 (RC into `main`) is open and **not merged**. It is held: the owner's 4 Nov instruction is "do not merge or deploy yet" | GitHub |

## Owner decisions already made (not to be re-asked)

| Decision | Recorded |
|---|---|
| The owner is the **final approver of the catalogue and of every image** | Owner, 4 Nov 2026 |
| Authenticated checks use the owner's **existing verified admin account**. No new admin account is to be created for testing | Owner, 4 Nov 2026 |
| **HomeRun image use is authorised by the owner** (17 Oct 2026, in writing; licence code `homerun-library-owner-licensed`). Each photo still needs mapping and per-photo approval; branding, logos, banners and copy stay excluded. What is missing is the *supporting licence documentation* (the underlying licence or grant), not the owner's approval. See `04` | `OWNER_INPUT_REQUIRED.md` answer log, `CLAUDE.md`, `lib/catalog-policy.ts` |
| Production runs in **catalogue/enquiry mode** until the transactional gates are met | Owner, 31 Oct 2026; `apphosting.production.yaml` |
| An empty category shows `coming_soon` rather than disappearing | Owner, 12 Oct 2026 |
| In production an approved photo needs an attested licence code | Owner, 11 Oct 2026 |

## Work already in flight (not duplicated here)

| Work | Where | State (4 Nov) |
|---|---|---|
| Issue #26: category, subcategory, listing and PDP browsing on web and mobile | Cloud session `task_8fee5356` | Draft PR #27 (`claude/dazzling-turing-4e3pb2`, targets the RC): back stack, deep links, no dead-end coming-soon pages, L1 parity. **It owns roadmap phase P2.** These documents only state the requirements it must meet and do not touch its files |
| Release candidate to `main` | PR #24 `release/rc-2026-10-19` | Open, not merged, held pending owner approval |
| Master catalogue V2.2 | PR #22 `claude/scan-review-register` (draft) | Open |
| Admin catalogue (inline create, media) | Issue #7 (an issue, not a PR) | `feat/admin-catalogue` is merged into the RC. Inline create from the product form is still open |
| Previously local-only branches | `claude/mrp-equals-price`, `claude/catalogue-update-import`, `claude/transactional-launch-surfaces` | **Pushed and merged into the RC** as PRs #29, #30 and #31 (4 Nov). Not deployed |
| `claude/category-navigation-slice` | Owner's Mac | No commits beyond `06d19d7` and not on `origin`. Its worktree folder no longer exists, so the uncommitted edits seen on 3 Nov cannot be located [C]. Its scope (home banners to empty categories, price controls with no prices) overlaps PR #27 and should be re-done there, if at all |
| Mobile catalogue mode | Workspace branches `claude/catalogue-mode-app` and `claude/mobile-catalogue-enquiries` | **Still not in the current mobile branch** (GAP-M-01) |
| Stale PRs #3–#6 | — | Closed |
