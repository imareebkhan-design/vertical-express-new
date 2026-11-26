# Current state — 13 Nov 2026

Baseline for the production-readiness review. Every row is marked:
**VERIFIED** (checked directly on 13 Nov), **REPORTED** (an earlier document says so,
not re-checked), **INFERRED**, or **UNKNOWN**. Nothing was changed in any environment
or database to produce this file.

## 1. System

One Next.js 15 application (App Router, Server Actions plus `/api/v1` for the phone
app), Prisma on Supabase Postgres, Firebase Auth (phone OTP and Google), Razorpay,
hosted on Firebase App Hosting in `asia-southeast1`. The phone app is a separate
Expo project in the workspace repository and talks to `/api/v1`.

| Part | Where | Status |
|---|---|---|
| Website, admin console, API | `imareebkhan-design/vertical-express-new` | VERIFIED |
| Phone app, design canvases, workspace docs | `imareebkhan-design/vertical-express-workspace` (`mobile/`) | VERIFIED |
| Hosting project | Firebase/GCP `vertical-express`, backends `ve-staging` and `ve-production` | VERIFIED |
| Driver app | No separate app. The Expo app includes a delivery-partner mode that calls `/api/v1/driver/**` | REPORTED (release-branch manual, phone-app audit); not run on a device |

## 2. Repositories and branches

### Website (`vertical-express-new`)

| Fact | Status | Evidence |
|---|---|---|
| `main` = `17f7bac` (22 Aug 2026) | VERIFIED | `git fetch` |
| `release/rc-2026-10-19` = `2530296`, 383 commits ahead of `main`, 0 behind | VERIFIED | `git rev-list --left-right --count` |
| CI green on `2530296` | VERIFIED | runs 43076670541 (push), 43076682554 (pull_request) |
| Neither `main` nor the release branch is protected; the repository is public | VERIFIED | GitHub API: "Branch not protected" |
| 38 migrations on the release branch, newest `20261031140000_order_confirmation_outbox` | VERIFIED | `git ls-tree` |
| PRs #54, #55, #56 merged into the release branch (11 Nov) | VERIFIED | `gh pr list` |
| PR #57 open (draft), head `1f8ab65`, one test file, CI green, mergeable | VERIFIED | diff read in full |
| PR #58 open, head `fe6a442`, both CI runs green (43364762252, 43364764867), merge state clean. The CodeRabbit "changes requested" review is against the older `873d5d8` | VERIFIED | `gh pr checks`, `gh pr view` |
| Other open PRs: #28, #34, #35, #36 (drafts), #40, #41 (documentation) | VERIFIED | `gh pr list` |
| Open issues: #7, #26, #44, #48, #50 | VERIFIED | `gh issue list`. #48 and #50 have merged fixes (#49, #51) and look closable — INFERRED |

### Phone app (`vertical-express-workspace`)

| Fact | Status | Evidence |
|---|---|---|
| `main` = `1bb21ef` (8 Nov) | VERIFIED | `git fetch` |
| Open PRs: #20 (icon and splash), #21 (TestFlight profile), #22 draft (home shortcuts follow visible categories), plus documentation PRs #10, #15, #16 | VERIFIED | `gh pr list` |
| Open issues: #1 (location-first address), #19 (unverified delivery claim on sign-in), #23 (stale link to a hidden category) | VERIFIED | `gh issue list` |
| Local checkout is on `claude/location-first-address` (`36d8fb8`), four commits not on `main`, with an uncommitted change to `.claude/launch.json` | VERIFIED | `git status` |

### Local worktrees

25 website worktrees and 7 workspace worktrees exist on this machine. None of the
release-relevant ones has uncommitted changes (VERIFIED, `git status` in each). No
stashes in either repository (VERIFIED). No locally modified `apphosting.yaml` was
found in any worktree (VERIFIED) — the earlier report of one no longer applies.

## 3. What is running

> **Superseded for staging on 14 Nov 2026.** Staging was redeployed and now serves
> `build-2026-11-13-001` from `1f09491` (verified against its source archive, 1,110
> files). The staging column below is the 13 Nov baseline, kept as the record of what
> the audit looked at. Production is unchanged.

| | Staging | Production |
|---|---|---|
| URL | `ve-staging--vertical-express.asia-southeast1.hosted.app` | `www.verticalexpress.in` (apex redirects 301) |
| Build, traffic | `build-2026-11-08-001`, 100% | `build-2026-11-07-001`, 100% |
| Source commit | `ea02aac` | `51a2da8` |
| Proof of source | Uploaded source archive is byte-identical to `git archive ea02aac` (1,074 files; only `.env.example`, `.env.test.example`, `.vercel-old`, `mobile-shell` excluded by `firebase.json`) | Same method against `51a2da8` (1,052 files, same exclusions) |
| Behind release head | 16 commits, no `prisma/` change | 34 commits, no `prisma/` change |
| Database | Supabase `gjhxhmcsuhxcmrvtkggz` | Supabase `gsfslnxvwmrgulzqypdp` |
| Migrations applied | 38 | 38 |
| Runtime identity | `ve-staging-runtime` | `firebase-app-hosting-compute` |
| Trading mode | Ordering open, `razorpay-test`, `ALLOW_TEST_GATEWAY=1`, COD off | `COMMERCE_MODE=catalogue`, COD off, no payment variable at all |
| Image bucket | `ve-staging-product-images` | `ve-production-product-images` |
| Order-cleanup cron | every 5 min, enabled | every 5 min, enabled |
| Uptime checks | none | home and `/api/health`, 5 min |
| `/api/health` | `ok` (04:39Z) | `ok` (04:39Z) |

All rows VERIFIED on 13 Nov from the App Hosting API, the uploaded source archives,
Secret Manager, Cloud Scheduler, Cloud Monitoring, Supabase and `curl`. The configuration
rows are read from the hosting files at each deployed commit's branch; the running
process's environment was not inspected.

The merged production rollout record describes `build-2026-11-06-001` (`f853f86`). The
build actually serving is `build-2026-11-07-001`; its record exists only in unmerged
PR #41.

### Phone builds (EAS)

| Build | Profile | Source | Status |
|---|---|---|---|
| Android, 8 Nov | `uat` (internal) | `6b0f8d0` — PR #20 branch, not `main` | VERIFIED |
| Android, 7 Nov | `uat` (internal) | `1bb21ef` (`main`) | VERIFIED |
| Android, 6 Nov | `production` (store), 1.0.0 build 4 | `36d8fb8` — the unmerged location-first branch | VERIFIED; which API it targets is under review |
| iOS | simulator builds only (17 and 31 Oct) | — | VERIFIED; no device or store build exists |

Whether any build was ever submitted to a store: UNKNOWN.

## 4. Environment isolation

| Boundary | Separated? | Status |
|---|---|---|
| Database | Yes — two Supabase projects | VERIFIED |
| Database, cron and Razorpay secrets | Yes — each readable only by its own backend's identity | VERIFIED (Secret Manager IAM) |
| Payment credentials | Staging holds test credentials only; production holds none | VERIFIED |
| Image storage | Yes — separate buckets | VERIFIED |
| Firebase Auth users | **No** — one project, one user pool | VERIFIED |
| Firebase Admin service-account key | **No** — one secret, readable by both | VERIFIED |
| Admin allowlist (`ADMIN_EMAILS`) | **No** — one secret for both | VERIFIED |
| Google Geocoding, Places and Routes keys | **No** — shared | VERIFIED |
| Razorpay webhook target and account mode | — | UNKNOWN (Razorpay dashboard not visible from here) |
| Public API exposure of the production database | None: zero tables, views or sequences are readable or writable by the `anon` or `authenticated` roles; no default grants. 18 tables have row-level security off and rely on those revoked grants alone | VERIFIED (catalogue query) |

Staging is isolated for data and money, and not for identity. A person who signs in
on staging is the same Firebase user on production; an operator on one allowlist is
an operator on both.

## 5. Not configured anywhere

The code reads these, and no hosting file sets them (VERIFIED by comparing
`process.env` reads with the three `apphosting*.yaml` files):

- `RESEND_API_KEY`, `EMAIL_FROM` — no transactional email leaves either environment.
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` — no error reporting beyond Cloud Monitoring.
- `NEXT_PUBLIC_POSTHOG_KEY` — no analytics.
- `NEXT_PUBLIC_FIREBASE_APPCHECK_*` — App Check off.
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` on production — the live map falls back.

## 6. Documents that disagree with the code

| Document | Says | Actually |
|---|---|---|
| `CLAUDE.md` in the main local checkout (`b605507`, 16 Oct) | Hosting is Vercel; `main` deploys on push; 544 tests | Firebase App Hosting; deploys are manual archive uploads; `main` is 383 commits behind and deploys nothing |
| `docs/readiness/2026-11-07-production-rollout-record.md` | Production is `build-2026-11-06-001` / `f853f86` | `build-2026-11-07-001` / `51a2da8` |
| `docs/readiness/2026-11-05-launch-readiness.md` | Staging and production share a runtime identity | Separated since 6–7 Nov |
| Issue #44 body | No UAT APK has been built | Two were built on 7 and 8 Nov |
| Mission brief of 13 Nov | PR #58 tested at `873d5d8` | Head is now `fe6a442`, tested by CI on 13 Nov |

## 7. Standing

Production takes no orders and no payments. Nothing in this baseline is a reason to
change that. The gap register (`PRODUCTION_GAP_REGISTER.md`) carries what must be true
first.
