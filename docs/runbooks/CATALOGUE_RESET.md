# One-time reset of the previous catalogue

Run once, by hand, against a database somebody names. There is no dashboard
button for this and there should never be one. Code:
`scripts/catalogue-reset.mts` over `lib/services/admin/catalogue-reset.ts`.

## What it does to each product made before the cutoff

| Action | When | Effect |
|---|---|---|
| **retire** | Anything history refers to: an order line, a stock movement, stock on hand, an enquiry, a recorded identity or photo approval, or a photo URL another product also uses | Status `archived`. Web address and every item code get `--legacy-YYYYMMDD`, so the same real product can be listed again under its own name and code. Old orders keep resolving: an order line points at the pack by id and carries its own title, pack and price snapshot. |
| **remove** | Nothing refers to it except the audit log (no foreign key, never deleted) | Row deleted, with its packs, photo rows, zero-stock records, express pincodes, price tiers, cart lines and wishlist entries. Stored image files are not touched (the bucket is create-only). |
| **exclude** | Made at or after the cutoff · a `qa-staging-*` fixture · in an order that is still open · already retired | Left exactly as it is; the manifest says why. |

Never written: categories, brands, warehouses, service areas and cities,
settings (Launch Control), orders, payments, refunds, returns, shipments, the
stock ledger, enquiries, the audit log. Apply counts these before and after
inside its transaction and rolls back if any changed (the audit log may only
grow).

## Historical records after a retire

A retired pack's item code becomes `<code>--LEGACY-YYYYMMDD`. Order lines point at the pack by id and keep their own
title, pack name and price, so orders, invoices, the order and ledger exports, refunds and returns are unchanged —
none of them prints the pack's code. Where a code *is* shown, `lib/retired-sku.ts` reads the suffix back:

| Screen | Shows |
|---|---|
| Order detail, packing slip, pick list | The code as sold, e.g. `VE-OPC-53-CEMENT-50KG` (order detail adds "listing since retired") |
| Stock ledger, Inventory, Today low stock | `VE-OPC-53-CEMENT-50KG (retired listing)` |
| Orders search | Still finds the order by the sold code |

QA fixtures archived with `--archive-qa-fixtures` keep their codes unchanged.

## Configuration is never written — and the command to use

The reset is **only** `scripts/catalogue-reset.mts` (`plan`, then `apply`, `restore` if needed). It needs no migration
and no seed. Apply hashes every preserved table — categories, brands, Launch Control `settings`, warehouses, service
cities and pincodes, orders, payments, refunds, returns, shipments, stock ledger, enquiries — before and after its
writes, in the same transaction, and rolls back if any byte differs.

Do **not** run `npm run db:seed`, `npm run db:demo:setup`, `npx prisma db seed` or `prisma migrate dev` as part of the
reset or a deploy. The seed upserts the demo categories (rewriting their name, order and SEO text) and brands; the
Prisma guard refuses it against any remote database unless `VE_ALLOW_REMOTE_DB=1` is set by hand. Deploys
(`npm run deploy:staging`, App Hosting builds) run `next build` only — no seed, import or migration.

Rehearsal check (18 Nov, fresh copy of the staging backup): `categories`, `brands`, `settings`, `service_cities`,
`serviceable_pincodes` and `warehouses` hashed identical before apply, after apply and after restore. (During the
17 Nov rehearsal the seed was run once to test its guard; its category upserts wrote the same values the rows already
had, which was confirmed by hash, and the copy was rebuilt anyway.)

## What could bring the old products back, and what stops it

| Job | Control |
|---|---|
| `prisma/seed.ts` (45 demo products, upserted by web address) | Skips products while a reset is in force (latest `catalogue.reset_applied` not followed by `catalogue.reset_restored`). The Prisma guard already refuses a remote database. **Note:** the seed still rewrites category names, order and SEO text on any database it runs against — never run it against staging or production. |
| `scripts/import-catalogue-ranges.mts --apply` | Refuses while a reset is in force; already refuses production. |
| `npm run qa:fixture` / `qa:catalogue` | Only `qa-staging-*` products, which the reset excludes and production never shows. |
| Deploys | Build only. No seed, import or migration. |

## Procedure

Run from the repository root. `DATABASE_URL` comes from the env file; the script never prints it.

```bash
R="NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=<.env for production | .env.staging> --import tsx scripts/catalogue-reset.mts"
```

1. **Back up** the whole database (`pg_dump -Fc`) and check it restores into a scratch database.
2. **Manifest (read-only):** `$R plan --cutoff=<ISO time before the first new product> --out=<absolute dir outside the repo>`
   — add `--archive-qa-fixtures` on staging. Writes `catalogue-reset-manifest-<ref>-<digest>.{json,md}` with the
   database identity, every candidate, what stays visible afterwards, and the preserved-table hashes.
3. **Owner approves** the exact database identity and digest.
4. **Apply:** `$R apply --manifest=<that .json> --expect-ref=<ref> --approve=<digest> --recovery-out=<absolute file outside the repo>`
   — add `--production` for `gsfslnxvwmrgulzqypdp`. Refuses a different database, a mistyped digest, or any change
   to any candidate product since the manifest (re-run step 2). The recovery file is written and fsynced before any change.
5. **Check:** old web addresses and `/api/v1/products/<slug>` return 404; search and categories list none of them;
   historical orders open in the console.

## Recovery

- **Undo the reset:** `$R restore --recovery=<file> --expect-ref=<ref>` (`--production` on production). One
  transaction; safe to run twice — a second run touches nothing it did not insert. It refuses a recovery file from
  another database, and refuses, naming each one, if a product listed since has taken an old web address or item
  code, or if a name was changed by anything other than this reset.
- **Prove it:** `… fingerprint > after.json` and compare with `before.json`; every table must match.
- **Last resort:** restore the `pg_dump` from step 1.

## Rehearsal, 17 Nov 2026 (local copy of the staging backup, 39 migrations)

- Manifest digest `73cdd374…d485`, cutoff 2026-11-17T12:00Z: 1,028 products — retire 329, remove 695, exclude 4
  (the four `qa-staging-*` fixtures; one is in 4 open order lines). Sources: 979 range import, 45 seed, 4 QA.
- A wrong digest and a wrong `--expect-ref` were both refused with nothing written.
- Apply: 329 archived and renamed, 695 removed. All 23 orders and 24 order lines still resolve; refunds,
  shipments, stock ledger, enquiries, categories, brands, warehouses and service areas unchanged.
- Restore: every fingerprinted table identical to before; a second restore reported 1,024 already in place.
- Re-planned and re-applied from a fresh copy: same digest — the plan is deterministic.
- After the reset, the seed refused to recreate the demo products.

## Manifests produced 18 Nov 2026 (read-only, cutoff 2026-11-18T10:22:00Z)

Files: `outputs/catalogue-reset-manifests-2026-11-18/{production,staging}/` in the workspace (not in this repository).
A manifest goes stale as soon as any candidate changes; produce a fresh one immediately before applying.

| | Production | Staging |
|---|---|---|
| Database identity | `supabase:gsfslnxvwmrgulzqypdp/postgres` | `supabase:gjhxhmcsuhxcmrvtkggz/postgres` |
| Digest | `d2138b9f…6e9a14` | `660430cc…9f7f83` (`--archive-qa-fixtures`) |
| Products before cutoff | 322 (263 catalogue-only, 59 archived) | 1,028 (716 draft, 263 catalogue-only, 49 published) |
| Retire (archive) | 319 — 260 with recorded approvals, 59 archived demo products holding stock | 333 — incl. the 4 QA fixtures, names kept |
| Remove | 3 catalogue-only products nothing refers to | 695 |
| Exclude | 0 | 0 |
| Still visible to customers afterwards | 0 | 0 |
| Orders / refunds / stock movements / enquiries | 0 / 0 / 0 / 0 | 23 / 2 / 62 / 2 (all preserved) |

Production's 274 range products show source "unknown": production holds one audit row, so its import left no record
there. They are inside the cutoff and listed individually in the manifest.

The QA fixtures on staging, all `qa-staging-*`, made by `npm run qa:fixture` / `qa:catalogue`:

| Fixture | Codes | History kept attached |
|---|---|---|
| `qa-staging-checkout-item` | QA-STAGING-1 | 21 order lines (4 in open test orders), 1 refund, 11 stock movements, 52 on hand, approval, 14 cart lines |
| `qa-staging-two-pack-sizes` | QA-STAGING-3L, -3S | 1 order line, 4 stock movements, 100 on hand, approval |
| `qa-staging-paint-tin` | QA-STAGING-2 | 1 stock movement, 50 on hand, approval |
| `qa-staging-bulk-bag` | QA-STAGING-4 | 1 stock movement, 50 on hand, approval |

Production has none, and never shows them (`QA_FIXTURE_PREFIX`). Archiving them on staging changes no order; a later
`npm run qa:fixture` would need them published again, which `restore` or the product page does.

## Rehearsal, 18 Nov 2026 (hardened script, fresh copy of the staging backup)

Plan with `--archive-qa-fixtures`: retire 333, remove 695, exclude 0, still visible 0. A mistyped digest, a relative
path and a path inside the repository were refused. Apply, then restore: every fingerprinted table identical to before.
