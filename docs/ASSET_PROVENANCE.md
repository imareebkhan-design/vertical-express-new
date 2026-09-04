# Asset provenance

Every image committed under `public/` that is used on a **product-level commercial
surface** — anywhere a price, a brand name and a buy button appear together — must have
an entry here recording where it came from and on what authority.

This file exists because the opposite was true for months: the catalogue shipped real
manufacturers' product photography under invented Vertical Express brand names, with no
record of where any of it came from. See ISS-044.

`scripts/check-assets.mjs` enforces the rule for `public/products/` and `public/hero/`
in CI. It cannot judge whether a claim here is *true* — only that a claim exists. The
entries are only as good as the person writing them.

---

## Generated assets

| File | Source | Authority | Added |
|---|---|---|---|
| `public/placeholder-product.webp` | Generated locally, no external source. Node `zlib` PNG encoder + `cwebp`, from the design tokens `--color-chip-soft #F2F0EC`, `--color-line #E7E4DF`, `--color-chip #EDEBE7`. Two abstract overlapping rounded squares. No text, no logo, no trademark, no depiction of any product. | Own work — no third-party content | 31 Aug 2026 |

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
