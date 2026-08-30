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
  `painting`, `tiling`, `waterproofing`, `wires-mcb-distribution-boards`. Still rendered
  as category tiles via `Category.imageUrl`.
- **`public/products/ss-kitchen-sink.webp`** and three category images with minor marks
  (`kitchen-sinks-faucets`, `conduits-gi-boxes`, `plywood-mdf-hdhmr`).

## Adding an asset

1. Prefer generated or owner-supplied imagery. Do not download third-party product
   photography.
2. Add a row above **before** committing the file, or CI fails.
3. If an asset is licensed, record the licence and its scope — not just "licensed".
