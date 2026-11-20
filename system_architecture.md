# Catalogue safety checkpoint — 9 October 2026

The operating manual remains authoritative. This checkpoint records only the catalogue gate pattern:

- `lib/catalog-policy.ts` is the shared public visibility predicate. Product status or image provenance alone is insufficient.
- `lib/services/admin/commercial-readiness.ts` validates owner commercial evidence against the current offer. Publication, cart and checkout reuse it.
- Approval invalidation lives in named database triggers. Catalogue reads bypass persistent caches; checkout locks the reviewed records through its order transaction.
- Tests create synthetic approvals only in an explicitly disposable local database. Historical business records are never automatically approved.

Schema details and rollout constraints: `docs/DATABASE_SCHEMA.md`. Verified results and release-integrator handoff: `docs/CATALOGUE_SAFETY_HANDOFF.md`.


# Launch readiness continuation

This note supplements CLAUDE.md; it does not replace the operating manual.

- Category listing URL filters are parsed by lib/category-query.ts on the server and mobile pagination path. Infinite-scroll responses belong to the initialResult identity and cannot overwrite a new filtered result.
- Product enquiries remain server-validated and stored in the existing admin queue. The owner operates that inbox; no alert transport or new response-time promise is implied. Pagination sorts by createdAt and id.
- COD_DISABLED=1 overrides pincode COD eligibility; checkout also retains the existing cod.enabled business setting. This changes eligibility, not historical records or stored service-area business values.
- Image approvals are tied to URL and content metadata by the existing database trigger. A URL update revokes approval. The rehome script must verify approval after updating and roll back on invalidation; it must not disable triggers or manufacture approvals. Copying exact bytes into another bucket alone does not complete the cutover.
- Hosting allows both exact image bucket paths during a future cutover/rollback window. No wildcard Google Storage image allowance was introduced.
- Local restore and backend test databases are distinct. Private production dumps, credentials and row-verification outputs remain outside git under the protected ve-readiness-private directory.

## Approval-preserving delivery — 6 Nov 2026

Do not rewrite product_images.url for bucket relocation. The approved URL/hash record remains provenance; lib/catalog/image-delivery.ts maps exact id/url/hash tuples to byte-verified generation-pinned copies using a committed manifest. Existing approval queries run before serialization. PRODUCTION_IMAGE_DELIVERY=1 activates only in declared production. Disable and rebuild for rollback. Fresh snapshot coverage verification must precede each rollout; preserve pinned generations. See docs/readiness/2026-11-06-image-delivery.md.
