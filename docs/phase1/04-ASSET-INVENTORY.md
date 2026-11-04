# D. Asset inventory and image-integration requirements

> **The licence position, stated plainly (corrected 4 Nov 2026).** Two separate things:
>
> 1. **Owner authorisation: recorded.** On 17 Oct 2026 the owner authorised, in writing, use
>    of the HomeRun image library for Vertical Express product photos. It is recorded in
>    `CLAUDE.md`, in the `OWNER_INPUT_REQUIRED.md` answer log and in the code as licence code
>    `homerun-library-owner-licensed`. It is an exception to the earlier standing rule
>    (`DEC-013`, `OWNER_INPUT_REQUIRED` 3.6) and it is the owner's to make. The owner is the
>    final approver of every image. **This is not an open decision.**
> 2. **Supporting licence documentation: not on file.** The ledger records that the source
>    folder is a browser "save page" of HomeRun's *home page* (754 files with scrape names),
>    with "no licence documents or source notes". The underlying licence or grant (licensor,
>    asset set, permitted use, territory, term, attribution) is therefore not in the record.
>    This is tracked as **DOC-01**, a documentation request.
>
> **Requirement IMG-0:** HomeRun-sourced photos follow the owner's authorisation as recorded:
> product photos only, each one mapped to its product and approved by the owner per photo;
> no HomeRun branding, logos, banners or copy. Engineering does not approve images and does
> not attach one without that per-photo approval. Whether DOC-01 must be on file before such
> photos appear on **sellable** products is the owner's call (T7).

---

## 1. Inventory

### 1.1 Repository static assets (app, `public/`) [C]

| Path | Files | Source | Licence / authority | Used on |
|---|---|---|---|---|
| `public/merchandising/category-tiles/` | 20 | AI-generated (Luma Photon via Pixa, 8 Oct 2026), unbranded | Own work; recorded in `docs/ASSET_PROVENANCE.md` | Category tiles: **current** |
| `public/merchandising/trending/` | 4 | Crops of the generated login scenes | Own work | Home "Trending in Srinagar" |
| `public/login/` | 2 | AI-generated editorial scenes (7 Oct) | Own work | Login, home banner |
| `public/categories/` | 20 | **15 match HomeRun composites** (pHash 0–4, per the 17 Oct ledger) | Covered by the owner's recorded authorisation; supporting documentation not on file (DOC-01). Some show brands with no visible products (Fevicol, Asian Paints, Birla White) | **Replaced** by the generated tiles. Restored only by owner decision **O-IMG-HR-1** |
| `public/products/` | 1 | Placeholder | Own work | Fallback |
| `public/qa/` | 1 | QA fixture | Internal | Staging only |

The CI script `scripts/check-assets.mjs` requires a provenance row for every file in
`public/products`, `public/hero`, `public/categories` and `public/merchandising`. It checks
that a claim exists, not that the claim is true.

### 1.2 Product photographs (database `ProductImage`, bucket) [C][L][D]

| Source class | Licence code | Count | State |
|---|---|---|---|
| Manufacturer official, dealer use (XTRA POWER, SGW, HI-MAX ranges) | `manufacturer-official-dealer-use` (owner's dealer-rights decision) | ~265 approved (PR #25) | **Served in production** |
| HomeRun library (relicensed 17 Oct) | `homerun-library-owner-licensed` | 35 relicensed + 5 attached as non-primary `REVIEW_REQUIRED` on staging | Mostly on draft products. Each needs the owner's per-photo approval (IMG-0) |
| Rights not attested (e.g. cement ranges, 11 Oct) | free text | — | **Never shown in production** (`approvedImageWhere` requires an attested code when `strictCatalogue()`) |

**Storage:** production reads `gs://ve-staging-product-images` (GAP-I-01). A plan to move
images to a production bucket exists (`claude/image-rehome-check`, E-6, merged).

### 1.3 Canvas assets

The canvases use an inline icon and glyph vocabulary (`i-*`, `g-*`). They contain **no
photographs**, so the product images shown on artboards are drawn placeholders. The glyph
set is a candidate source for missing category icons (the 3 tools categories), subject to
the UI designer's review.

### 1.4 Workspace catalogue evidence

`docs/catalog/*` (workspace) contains the master catalogue V2.2 (PR #22), the 2 Nov working
spreadsheet and its dry run (996 rows, all invalid: no MRP or price), the HomeRun reference
studies and the 17 Oct ledger with contact sheets.

---

## 2. Image-integration requirements

| ID | Requirement | Status |
|---|---|---|
| IMG-0 | HomeRun-sourced images: used under the owner's recorded authorisation, product photos only, each approved by the owner per photo (above) | Owner-authorised. Documentation: DOC-01 |
| IMG-1 | Every customer-visible product image has: `sha256`, `sourceVerified`, `identityApproved`, an `approvalStatus` of `APPROVED_EXACT` or `APPROVED_WITH_LIMITATION`, `approvedBy`/`At`/`Reason`, and in production an **attested licence code** | VERIFIED (code) |
| IMG-2 | A range-representative image is never presented as the exact SKU. The PDP says "representative image" when the status is `APPROVED_WITH_LIMITATION` | PARTIAL: confirm the wording on web and mobile in P2 |
| IMG-3 | Images carrying a third party's MRP sticker, warranty claim, promotional text or another retailer's watermark are rejected | Process rule. Enforced by the reviewer, recorded in `approvalReason` |
| IMG-4 | Production images are served from a production-owned bucket. Staging writes cannot change production | MISSING (GAP-I-01) |
| IMG-5 | Derivatives: display (≤ 800 px WebP) and thumbnail (≤ 400 px) generated, with `sizes`/`srcset` and lazy loading below the fold | PARTIAL: `-display.webp` exists. Thumbnails and lazy loading need verifying (GAP-PF-01) |
| IMG-6 | Every image has a meaningful `alt` (product name and pack, or category name). An empty alt is allowed only for decorative art | IMPROVE (GAP-A-01) |
| IMG-7 | Category tiles: one for each **launched** category, unbranded or showing only brands with visible products, with a provenance row and owner approval | PARTIAL (GAP-C-04: 3 missing) |
| IMG-8 | Upload via `/api/admin/product-images` starts at `REVIEW_REQUIRED`, and an edit to identity or image clears approval (DB triggers) | VERIFIED (code) |
| IMG-9 | Owner-supplied packs (a future shoot or brand-supplied photos) arrive with a manifest giving file, product SKU, source, licence or authority, and date, and go through the guarded importer (`scripts/import-product-images.mts`) with a plan hash | Process. Template to be added in P1 |
| IMG-10 | Banner and editorial imagery: generated scenes or owner photography only. No product claims | VERIFIED (current). Owner input 12.5 open |

## 3. What the owner must supply for images

1. DOC-01: the supporting HomeRun licence documentation, for the record. (The authorisation itself is already given.)
2. O-IMG-HR-1: keep the generated category tiles (recommended), or restore specific HomeRun tiles where the category actually stocks the brands shown.
3. Brand authorisation for manufacturer imagery beyond the three current ranges (OWNER 3.4).
4. Approval of tiles for the three tools categories, or a decision to fold them into the canvas taxonomy (D-01).
5. The production bucket name and the go-ahead to copy approved images (D-16, GAP-I-01).
