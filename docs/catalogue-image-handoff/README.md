# Catalogue image handoff

This is a research snapshot, not a publication or approval manifest. No application code, migration, production data or approval fields are changed.

## Verified staging state

630 products checked in a read-only database transaction. All remain draft. 494 primary images match the SHA-256 of the local originals; 136 have no image. All attached images remain REVIEW_REQUIRED with identity_approved and source_verified false. No product identity is confirmed.

Research classifications: 167 representative ranges, 2 exact image candidates, 151 pack reviews, 173 identity reviews and 1 legacy source replacement. 136 sourcing tasks remain; no claim of exhausted search. 103 media normalization flags remain advisory and visual review is incomplete.

The manifest contains public source/asset URLs and byte hashes, with local paths, database IDs and credentials excluded. Assets remain in the existing staging image bucket; they are not copied into the application.

## Release boundary

Only ve-staging exists in the configured Firebase project as of this verification. No production backend was found. GitHub main is older than the integration checkout; this isolated documentation-only branch is based on origin/main and must not replace the integration branch.

The current integration application requires explicit approved imagery and product identity. The research ledger's catalogue-only and representative classifications are not implemented publication permissions. Do not import this manifest as owner approval, publish its drafts, or relax commercial guards. The two exact candidates also still require owner approval.

## Next steps

1. Review the blank owner-review batches using the existing verified staging admin account. Range approval permits only a clearly labelled representative/enquiry presentation once such a workflow is implemented and tested; it never confirms an exact SKU, pack, price or inventory.
2. Finish the 461 unresolved research records and the media review. Keep unresolved identities and pack conflicts hidden.
3. Integrate through the current release checkout after its owner has reviewed this handoff. Verify a backed-up target database and a supported approval/import workflow before any live data change.

Rollback: revert this documentation commit. No deployment or database rollback is needed because this handoff does not mutate runtime data.
