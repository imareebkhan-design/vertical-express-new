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

## What could bring the old products back, and what stops it

| Job | Control |
|---|---|
| `prisma/seed.ts` (45 demo products, upserted by web address) | Skips products while a reset is in force (latest `catalogue.reset_applied` not followed by `catalogue.reset_restored`). The Prisma guard already refuses a remote database. **Note:** the seed still rewrites category names, order and SEO text on any database it runs against — never run it against staging or production. |
| `scripts/import-catalogue-ranges.mts --apply` | Refuses while a reset is in force; already refuses production. |
| `npm run qa:fixture` / `qa:catalogue` | Only `qa-staging-*` products, which the reset excludes and production never shows. |
| Deploys | Build only. No seed, import or migration. |

## Procedure

Use a shell where `DATABASE_URL` points at the target. The script never prints it.

```bash
export R="NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=<env file> --import tsx scripts/catalogue-reset.mts"
```

1. **Back up the whole database** (`pg_dump -Fc`) and check it restores into a scratch database. This is the recovery of last resort.
2. **Fingerprint** — `… fingerprint > before.json`.
3. **Manifest (read-only)** — `… plan --cutoff=<ISO time just before the first new product> --out=<dir outside the repo>`.
   Writes `catalogue-reset-manifest-<ref>-<digest>.{json,md}`. Read the `.md`: environment, cutoff, digest,
   every candidate with its id, slug, SKUs, source and references, and the excluded list with reasons.
4. **Owner approves** the exact environment and digest.
5. **Apply** — `… apply --cutoff=<same> --expect-ref=<ref> --approve=<digest> --recovery-out=<file outside the repo>`
   (add `--production` for the production project). Refuses if the database no longer produces that digest.
   The recovery file is written and fsynced before any change.
6. **Check** — old web addresses and `/api/v1/products/<slug>` return 404; search and categories list none of them;
   historical orders open in the console.

## Recovery

- **Undo the reset:** `… restore --recovery=<file> --expect-ref=<ref>`. One transaction; safe to run twice.
  It refuses, naming each clash, if a product listed since has taken an old web address or item code — archive
  and rename that product first, or restore from the backup.
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
