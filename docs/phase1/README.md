# Phase 1 — Discovery, audit and PRD (3 November 2026)

This folder contains the documents only. No application code, database, hosting or
production setting was changed to produce it. **Engineering does not begin until the owner
approves these documents.**

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

**Old documentation compared with current code.** `main` in both repositories is stale.
In the app it is the August Prisma 7 merge, 316 commits behind the release branch. The real
head is `release/rc-2026-10-19` (PR #24, open, mergeable, CI green). Several documents
that call themselves authoritative have drifted, and where they disagree with the code, the
code is used here:

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

## Work already in flight (not duplicated here)

| Work | Where | State |
|---|---|---|
| Issue #26: category, subcategory, listing and PDP browsing on web and mobile | Cloud session `task_8fee5356` | Draft PR #27 (`claude/dazzling-turing-4e3pb2`): back stack, deep links, no dead-end coming-soon pages, L1 parity. This plan treats it as the owner of roadmap phase P2 |
| Production backend in catalogue mode | PR #25 `claude/production-backend` (draft) | Deployed. `www.verticalexpress.in` serves it and the apex 301-redirects to www [L] |
| Release candidate to `main` | PR #24 `release/rc-2026-10-19` | Open, CI green |
| Master catalogue V2.2 | PR #22 `claude/scan-review-register` (draft) | Open |
| Admin catalogue (inline create, media) | Issue #7 (an issue, not a PR) | `feat/admin-catalogue` is merged into the RC. Inline create from the product form is still open |
| Local-only, unpushed branches | `claude/mrp-equals-price` (1 commit), `claude/catalogue-update-import` (3), `claude/transactional-launch-surfaces` (1), `claude/category-navigation-slice` (uncommitted worktree edits) | These exist only on the owner's Mac |
| Mobile catalogue mode | Workspace branches `claude/catalogue-mode-app` and `claude/mobile-catalogue-enquiries` | **Not in the current mobile branch** (see GAP-M-01) |
