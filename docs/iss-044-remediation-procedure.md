# Phase 2 Resume — Brand Imagery Remediation (ISS-044)

## Context

Session terminated on credit exhaustion mid-edit. Resuming Phase 2 of the branded-imagery
remediation on branch `fix/brand-imagery-remediation` inside
`/Users/areebsmac/Virtical Express/homerun-clone`. The previous session completed more
than the user's checklist expected; only one code fix remains before the commit can be
assembled and gates run.

---

## Step 1: State — Confirmed

**Branch:** `fix/brand-imagery-remediation` (not `design-system/apply-tokens` as the
session context stated — the branch was already created under this name; the context
reference is stale).

**Backup:** `.image-backups/product-images-2026-08-30T20-36-06-876Z.json` — **29 rows,
16 distinct URLs, every row carries id and slug. Valid before-state confirmed.**
Note: `len(d)` = 7 counted the top-level dict keys (`createdAt`, `issue`, `rowCount`,
`expectedRowCount`, `replacementUrl`, `restore`, `rows`), not the row array. The plan
previously stated "7 rows" — that was wrong and is corrected here.

### Checkpoint verdicts

| # | Item | Status |
|---|------|--------|
| a | seed.ts — 5 branded refs removed, ss-kitchen-sink retained | **DONE** |
| b | 5 branded files deleted from public/products/ | **DONE** |
| c | public/categories/ — 19 webp + README, untouched | **DONE** |
| d | hero.tsx — 2 branded refs removed, Truck-icon fallback intact | **DONE** |
| e | login-hero.tsx — brand names as text? | **DONE** (already fixed in prev session) |
| f | lib/data.ts — DEALS repointed to placeholder | **DONE** (already fixed in prev session) |
| g | Regression guard — false positive on ss-kitchen-sink | **BROKEN** (fix below) |
| h | public/placeholder-product.webp — committed | **NOT DONE** (still untracked) |

**Additional deleted (not in user checklist):** 6 hero images also removed:
`acc-suraksha-power.png`, `asianpaints-smartcare.png`, `asianpaints-tractor-uno.png`,
`drfixit-pidiproof.png`, `loctite-sealant.png`, `polycab-optima.png`

**Untracked files that need staging:**
- `docs/ASSET_PROVENANCE.md`
- `public/placeholder-product.webp`
- `scripts/check-assets.mjs`

---

## Step 2: Push branch

```
git push -u origin fix/brand-imagery-remediation
```

This does not deploy. Only main deploys.

---

## Step 3: Remaining fixes (in order)

### Fix 1 — Asset guard `BRANDED` → `BRANDED_BLOCKED` (scripts/check-assets.mjs:71)

The script crashes with `ReferenceError: BRANDED is not defined` because
`BRANDED_BLOCKED` and `BRANDED_TRACKED` are defined but the seed check at line 71
still references the old variable name `BRANDED`.

**Change:** `if (BRANDED.has(ref)) {` → `if (BRANDED_BLOCKED.has(ref)) {`

**Rule that results:**  
`BRANDED_BLOCKED` = category composite images carrying prominent third-party marks.  
Any `image:` field in seed.ts pointing to one of these → guard FAIL.  
`BRANDED_TRACKED` = acknowledged marks retained by owner decision (includes
`/products/ss-kitchen-sink.webp`).  
Guard does NOT block `BRANDED_TRACKED` entries → ss-kitchen-sink PASSES.  
This is a principled set membership test, not a filename special-case.

**After fix:** run `node scripts/check-assets.mjs` to confirm no crash and green output.

### Fix 2 — Stage untracked files

```
git add docs/ASSET_PROVENANCE.md public/placeholder-product.webp scripts/check-assets.mjs
```

### Fix 3 — Record new finding in KNOWN_ISSUES.md (ISS-044 / ISS-008 surface)

Add under ISS-044 or ISS-008 section: "Login hero rendered third-party brand names as
TEXT in addition to using their photography. The component text labels read
'ACC Suraksha Power', 'Dr. Fixit Pidiproof LW+ 101', 'Polycab Optima+', 'Asian Paints
Tractor Uno and SmartCare', 'Loctite General Purpose Sealant'. The investigation
initially tracked only the image refs at lines 53-63 of the old component and missed
the text labels. Classification: ISS-008 (fabricated/unauthorized claims) as well as
ISS-044 (branded imagery). Status: FIXED — replaced with generic material categories
(CEMENT / WATERPROOFING / ELECTRICAL / PAINT / HARDWARE / PLUMBING)."

---

## Step 3b: login-hero.tsx content — GATE BEFORE COMMIT

The replacement content already written (lines 62-69, modified but uncommitted):

```
const PRODUCTS: HeroProduct[] = [
  { src: PLACEHOLDER, ar: 1, fill: 0.62, brand: "CEMENT",        name: "Bagged cement",               speed: "scheduled" },
  { src: PLACEHOLDER, ar: 1, fill: 0.5,  brand: "WATERPROOFING", name: "Waterproofing compounds",      speed: "express"   },
  { src: PLACEHOLDER, ar: 1, fill: 0.7,  brand: "ELECTRICAL",    name: "Wires & cables",               speed: "express"   },
  { src: PLACEHOLDER, ar: 1, fill: 0.55, brand: "PAINT",         name: "Interior & exterior paint",    speed: "express"   },
  { src: PLACEHOLDER, ar: 1, fill: 0.66, brand: "HARDWARE",      name: "Adhesives & sealants",         speed: "express"   },
  { src: PLACEHOLDER, ar: 1, fill: 0.58, brand: "PLUMBING",      name: "Pipes & fittings",             speed: "scheduled" },
];
```

Animation (rAF loop, ResizeObserver, reduced-motion handling) is intact and unchanged.
No manufacturer brand names appear in any rendered text or image source.

---

## Step 4: Quality gates

Run in order, report actuals:

1. `node scripts/check-assets.mjs` (asset guard — no npm alias)
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run check:ds` (design system token check — separate from asset guard)
5. `npm test` (report actual pass/fail count, not 112/112 assumption)
6. `npm run build`

**Note:** `npm run check:ds` is `node scripts/check-design-system.mjs` (design tokens),
not the asset guard. Run both separately.

---

## Step 5: Commit

After green gates and user approval of login-hero content:

Staged diff will include:
- `M .gitignore`
- `M components/auth/login-hero.tsx`
- `M components/sections/hero.tsx`
- `M lib/data.ts`
- `M prisma/seed.ts`
- `D public/hero/` × 6 branded images
- `D public/products/` × 5 branded images
- `A docs/ASSET_PROVENANCE.md`
- `A public/placeholder-product.webp`
- `A scripts/check-assets.mjs`

Suggested message:
```
fix(assets): remove unauthorized branded imagery and install asset guard (ISS-044)

Replaces 5 product photos and 6 hero images carrying third-party manufacturer marks
with a neutral placeholder. Rewrites login hero and main hero carousel to use generic
material categories instead of named third-party products. Installs check-assets.mjs
(npm run check:assets) to prevent recurrence. Adds ASSET_PROVENANCE.md as the
authoritative record of image origins.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## Gated: Production UPDATE

**Scope correction (item 2):** The production write is `ProductImage.url` ONLY — 29 rows.
`Category.imageUrl` was never in scope and has been removed from this plan.

The 29 `ProductImage` rows happen to reference `/categories/…` paths as their URL values
(the seed previously fell back to category composites), but the table being written is
`ProductImage`, not `Category`.

The UPDATE does not run until the user types `APPROVE PRODUCTION UPDATE`.

## Build output — actual route count (item 4 - CORRECTED)

Actual route counts from Next.js build table (excluding the 3 legend lines ○/●/ƒ and Middleware line):
- **45 total routes**
- **14 ○ Static** (prerendered as static content)
- **2 ● SSG templates** (`/category/[slug]` generating 20 paths, `/product/[slug]` generating 45 paths = 65 SSG pages)
- **29 ƒ Dynamic** (server-rendered on demand)
- Prerendered static pages generated during build: **96 static pages** (14 static + 65 SSG + root/error/manifest pages)
- Middleware: 96 kB bundle size

## Edit Attribution Correction (formerly "Formatter hook incident")

Investigation of `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`, and `.claude/hooks/` confirmed:
- No configured hook modifies source code or invokes an LLM. Active hooks are GSD status monitor and prompt guard scripts.
- The edits (three ss-kitchen-sink path flips, synthesized Prisma updateMany block in `prisma/seed.ts`, regex alternation rewrite, and provenance check restructuring into a table parser) were direct model actions in the previous assistant session, erroneously misattributed to a formatter.
- Correction to commit `2a3b9d7` message: The changes were made by the assistant, not caused by any formatter or hook.
- The synthesized `updateMany` block in `prisma/seed.ts` has been reverted in commit `0a00991` so that `ProductImage` is left untouched on update, adhering strictly to §9 and §20.
