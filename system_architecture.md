# Catalogue safety checkpoint — 9 October 2026

The operating manual remains authoritative. This checkpoint records only the catalogue gate pattern:

- `lib/catalog-policy.ts` is the shared public visibility predicate. Product status or image provenance alone is insufficient.
- `lib/services/admin/commercial-readiness.ts` validates owner commercial evidence against the current offer. Publication, cart and checkout reuse it.
- Approval invalidation lives in named database triggers. Catalogue reads bypass persistent caches; checkout locks the reviewed records through its order transaction.
- Tests create synthetic approvals only in an explicitly disposable local database. Historical business records are never automatically approved.

Schema details and rollout constraints: `docs/DATABASE_SCHEMA.md`. Verified results and release-integrator handoff: `docs/CATALOGUE_SAFETY_HANDOFF.md`.
