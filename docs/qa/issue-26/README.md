# Issue #26: category browsing QA evidence (3 Nov 2026)

Branch `claude/dazzling-turing-4e3pb2`, based on `release/rc-2026-10-19` (`06d19d7`).

## How this was tested

- Local Postgres 16, all migrations, `prisma/seed.ts` (synthetic catalogue: 20 categories, 45 products), approved
  for tests by `test-support/approve-seed-catalogue.mts`. Cement and the whole Plumbing department were set to `draft`
  so the local mix matches production's: some categories available, some coming soon, one entire department empty.
- `next build` + `next start` (production bundle), `COMMERCE_MODE=catalogue`, `VE_DEPLOY_ENV=staging` with a
  `rzp_test_` placeholder. That relaxes only the licence-code rule; every other photo and identity approval gate
  still applies. No production system, database or credential was touched.
- Playwright (Chromium) as **Pixel 7** (mobile web, which is also what the Expo shell renders) and **1440×900** desktop.
  The phone journey was also run on emulated 4G (1.6 Mbps, 150 ms) with 4× CPU throttling.

## What actually failed at runtime (before)

| # | Surface | Failure | Status |
|---|---|---|---|
| 1 | Phone / app shell | Category Back arrow **pushed** `/categories`: Home → Tiling → arrow → Categories → system back → **Tiling again** (loop) | Fixed, ISS-098 |
| 2 | Phone / app shell | Product opened from a shared link / cold start: Back arrow did nothing (no history) | Fixed, ISS-098 |
| 3 | Phone + desktop | Coming-soon category in an empty department (all of Plumbing): only exit was "Browse all categories" | Fixed, ISS-099 |
| 4 | Desktop | Missing Firebase web config takes down **every** page incl. categories ("Something went wrong") | Open, ISS-100 (prod has config) |
| 5 | All | In production, a category is "Coming soon" whenever none of its products has an approved, **licence-coded** primary photo. Most categories showing "Coming soon" is the catalogue gate working, not a routing bug | By design (owner, 12 Oct); see owner list |

Not reproduced: no 404 from live navigation (every `/category/*` and `/product/*` link reachable from Home,
`/categories`, `/search`, a listing and the coming-soon pages returned 200); no client errors; tile → listing
≈ 0.4 s and listing → product ≈ 0.4–0.9 s on the production build. An unknown slug is a real 404 and is not linked
from anywhere.

## Journey results (after), production build

```
PASS [phone] 25 category/product links from live navigation all 200
PASS [phone] tap Tiling tile -> listing in 423ms
PASS [phone] listing shows 3 product links
PASS [phone] tap product -> PDP in 413ms
PASS [phone] PDP Back arrow -> /category/tiling
PASS [phone] category Back arrow -> /categories (history pop)
PASS [phone] then system back -> / (expected home, not Tiling again)
PASS [phone] deep-linked PDP Back -> /category/tiling
PASS [phone] deep-linked category Back -> /categories
PASS [phone] empty-department coming-soon offers 4 stocked categories
PASS [phone] its first suggestion opens onto products
PASS [phone] unknown slug is a real 404 (not reachable from live nav)
PASS [phone] no page errors
PASS [desktop] 53 category/product links from live navigation all 200
PASS [desktop] tap Tiling tile -> listing in 415ms
PASS [desktop] listing shows 3 product links
PASS [desktop] tap product -> PDP in 859ms
PASS [desktop] PDP breadcrumb -> /category/tiling
PASS [desktop] empty-department coming-soon offers 4 stocked categories
PASS [desktop] its first suggestion opens onto products
PASS [desktop] unknown slug is a real 404 (not reachable from live nav)
PASS [desktop] no page errors
FAILS 0
```

## Screenshots vs artboards

`artboards/` holds the approved canvases rendered from `vertical-express-workspace` (`design-canvas/parts/*`,
`web-canvas/parts/*`). `after/` holds this branch on the local production build. Product names, brands and
prices in `after/` are **synthetic seed data**, not catalogue.

| Screen | Artboard | Build | Differences |
|---|---|---|---|
| Categories L1 (phone) | `artboards/design-Categories.webp` | `after/phone-02-categories-L1.webp` | **Now matched:** tint dot + category count per department, total under title. **Still different:** tiles are the generated photo set (provenance in `docs/merchandising/category-tiles.json`), not the canvas's line icons on tint, an earlier owner choice. "Coming soon" chip has no artboard (owner decision 12 Oct). Subtitle omits "everything we stock in Srinagar" (untrue while categories are empty). Canvas shows 21 categories incl. *Power Tools & Accessories* under Electrical; the build has 20 designated + Power Tools in "Tools & Equipment" only when stocked. |
| Categories L1 (desktop) | `artboards/web-Categories.webp` | `after/desktop-02-categories-L1.webp` | Department count added. Canvas puts a **product count** on every tile ("148 products"); the build deliberately does not (fabricated counts removed earlier). Canvas hero copy "Everything we hold in Srinagar" not used. |
| Category landing L2 (phone) | `artboards/design-Subcategory.webp` | `after/phone-03-category-L2-listing.webp` | Build merges L2 and the listing into one screen. Missing vs canvas: tinted hero banner with handling line, "Shop by grade" tiles (render only when products carry those attributes; the seed has none), "N products · N brands" subtitle, search + cart icons in the header. Present: brands strip, product list, filters. |
| Category landing (desktop) | `artboards/web-CategoryLanding.webp` | `after/desktop-03-category-L2-listing.webp` | Present: breadcrumb, tinted banner, brands, filters, grid. Missing: description/handling copy, delivery chip ("Tomorrow, 8 AM": an unconfirmed SLA, must not be built), "Buying cement in Srinagar" editorial and FAQ (owner copy needed). The brand strip and filter column overlap visually at 1440 px (minor layout defect, not fixed here). |
| Product (phone/desktop) | `artboards/design-ProductDetail.webp`, `artboards/web-ProductDetail.webp` | `after/*-04-product.webp` | Catalogue mode shows "Enquire" instead of add-to-cart (correct). The canvas calculator and delivery promise are not built (calculator is P1; SLA unconfirmed). |
| Coming soon | none (no artboard exists) | `after/*-05-*.webp`, `after/*-06-*.webp` | New state the canvases never drew. Built from the canvas's own tile + typography language. |

## Not done here, and why

- **Expo app (`mobile/`)**: it is not on the release branch. It exists only on `claude/eas-cli-init-gfdj9z`
  (branched from `main`, not the RC). It is a **WebView shell** around the website, so every fix above reaches it with
  no app change. Issue #26 cites `mobile/src/components/category-tile.tsx`; that file does not exist on any branch.
  Not verified on a device or simulator from here. Two shell gaps to check when it is merged: it does not identify
  itself to the site (the site detects only Capacitor, so a tablet gets the desktop layout), and it has no https
  deep-link (`intentFilters` / associated domains) config.
- `docs/UI_PARITY_MATRIX.md`, `docs/ARTIFACT_PRODUCT_MANIFEST.md`, `docs/ARTIFACT_INTERACTION_MANIFEST.md` do not
  exist on any branch of either repository. This comparison was made directly against the canvases.
- No staging deploy, no production change, no migration, no catalogue publication.
