# Asset provenance

Every image committed under `public/` that is used on a **product-level commercial
surface** — anywhere a price, a brand name and a buy button appear together — must have
an entry here recording where it came from and on what authority.

This file exists because the opposite was true for months: the catalogue shipped real
manufacturers' product photography under invented Vertical Express brand names, with no
record of where any of it came from. See ISS-044.

`scripts/check-assets.mjs` enforces the rule for `public/products/`, `public/hero/`, `public/categories/` and `public/merchandising/`
in CI. It cannot judge whether a claim here is *true* — only that a claim exists. The
entries are only as good as the person writing them.

---

## Generated assets

| File | Source | Authority | Added |
|---|---|---|---|
| `public/placeholder-product.webp` | Generated locally, no external source. Node `zlib` PNG encoder + `cwebp`, from the design tokens `--color-chip-soft #F2F0EC`, `--color-line #E7E4DF`, `--color-chip #EDEBE7`. Two abstract overlapping rounded squares. No text, no logo, no trademark, no depiction of any product. | Own work — no third-party content | 31 Aug 2026 |

| `public/login/build-scene.webp` | AI-generated editorial illustration (Codex, built-in image generation, 7 Oct 2026), 1200×800 WebP, sha256 `8b442b5d…`. Unbranded building-site scene. Prompt and hashes: workspace `docs/evidence/login-showcase-2026-10-07/v2/`. Also the homepage launch banner. | Own work — generated for this project; no third-party content, no marks | 7 Oct 2026 |
| `public/login/finish-scene.webp` | As above, sha256 `eef371e2…`. Unbranded interior-materials scene. Also the homepage interiors banner. | Own work — generated for this project; no third-party content, no marks | 7 Oct 2026 |
| `public/merchandising/trending/new-build.webp` | Crop of `public/login/build-scene.webp` (box 40,250,920,800, Pillow, Lanczos), 720×450 WebP q82. Editorial category picture for the homepage — never a product image. | Own work — derived from the generated scene above | 7 Oct 2026 |
| `public/merchandising/trending/floors-walls.webp` | Crop of `public/login/finish-scene.webp` (box 300,90,900,465, Pillow, Lanczos), 600×375 WebP q82. Editorial category picture for the homepage — never a product image. | Own work — derived from the generated scene above | 7 Oct 2026 |
| `public/merchandising/trending/bath-kitchen.webp` | Crop of `public/login/finish-scene.webp` (box 760,240,1200,515, Pillow, Lanczos), 440×275 WebP q82. Editorial category picture for the homepage — never a product image. | Own work — derived from the generated scene above | 7 Oct 2026 |
| `public/merchandising/trending/woodwork.webp` | Crop of `public/login/finish-scene.webp` (box 0,260,740,722, Pillow, Lanczos), 720×450 WebP q82. Editorial category picture for the homepage — never a product image. | Own work — derived from the generated scene above | 7 Oct 2026 |

| `public/merchandising/category-tiles/ceiling-fans-exhaust.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/cement.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/conduits-gi-boxes.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/cpvc-pipes-overhead-tanks.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/door-locks-hardware.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/fevicol.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/general-hardware-tools.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/hinges-channels-handles.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/home-appliances-power-backup.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/kitchen-sinks-faucets.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/kitchen-systems-accessories.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/lighting.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/painting.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/plywood-mdf-hdhmr.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/sanitary-bath-fittings.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/switches-sockets.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/tiling.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/wardrobe-bed-fittings.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/waterproofing.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |
| `public/merchandising/category-tiles/wires-mcb-distribution-boards.webp` | AI-generated product picture (Luma Photon via Pixa, 8 Oct 2026), background removed, composited to 600×600 transparent WebP. Unbranded generic product, no text or marks (each checked by eye). Prompt, hash and processing: `docs/merchandising/category-tiles.json`. Category tile and stand-in for products without a photograph; never presented as a specific SKU's photo. Same files bundled in the app at `mobile/assets/images/categories/`. | Own work — generated for this project; no third-party content, no marks | 8 Oct 2026 |

## Owner-supplied or licensed assets

*None recorded.* No licence, attribution or permission documentation exists for any
third-party image in this repository. The owner has confirmed holding no documented
authorization, and `docs/CURRENT_SYSTEM_AUDIT.md:343` and `:933` independently record
the authorised-dealer question as still open.

## Known third-party imagery still present

Retained deliberately and tracked as follow-up, **not** cleared for use:

- **10 category images** carrying manufacturer marks — `cement`, `cpvc-pipes-overhead-tanks`,
  `fevicol`, `general-hardware-tools`, `home-appliances-power-backup`, `lighting`,
  `painting`, `tiling`, `waterproofing`, `wires-mcb-distribution-boards`.

  **They are not rendered anywhere.** This entry said "still rendered as category tiles via
  `Category.imageUrl`", and that is not true and appears never to have been: no service
  selects `Category.imageUrl`, and `components/category-card.tsx` — the only file that
  builds a `/categories/<slug>.webp` path — is imported by nothing. `/categories` draws
  inline SVG icons on a tinted ground and requests no image at all (verified in the
  browser: zero `<img>` elements on the page).

  **What is still true, and is the actual exposure:** they sit in `public/`, so Next.js
  serves every one of them as a static asset to anyone who requests the URL.
  `/categories/cement.webp` returns 200 today. That is publishing a third party's mark at
  a guessable address — smaller than presenting it beside a price and a buy button, and
  not nothing.

  Correcting both halves matters: the first overstated where they appear, which invites
  an urgent fix to a page that does not exist; the second understated that they are
  reachable at all, which invites leaving them.
- **`public/products/ss-kitchen-sink.webp`** and three category images with minor marks
  (`kitchen-sinks-faucets`, `conduits-gi-boxes`, `plywood-mdf-hdhmr`).

- **Six more category composites of unverified origin** — `door-locks-hardware`,
  `hinges-channels-handles`, `kitchen-systems-accessories`, `sanitary-bath-fittings`,
  `switches-sockets`, `wardrobe-bed-fittings`.

  Added 5 Sep 2026, after opening each one. They had no provenance entry and were not on
  any tracked list, which read as "fine" and was only ever "unexamined" — `categories` was
  not among the directories this registry was enforced over.

  They are the same house style as the thirteen above: product-photography composites on a
  tinted ground, of a kind a manufacturer or a marketplace produces. None carries a
  *prominent* legible mark, which is presumably why they were never flagged. Several carry
  small text too low-resolution to read, and `kitchen-systems-accessories` includes
  third-party consumer-goods labels on the bottles in the pull-out.

  **Not cleared.** "No visible logo" is not a licence, and nothing here records where any
  of them came from. Treat all nineteen category composites as one question rather than
  two: whoever can answer it can answer it once.

## Adding an asset

1. Prefer generated or owner-supplied imagery. Do not download third-party product
   photography.
2. Add a row above **before** committing the file, or CI fails.
3. If an asset is licensed, record the licence and its scope — not just "licensed".
