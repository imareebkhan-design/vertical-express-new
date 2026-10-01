-- Additive. Nullable, so every existing row is valid on write.
ALTER TABLE "profiles" ADD COLUMN "onboarded_at" TIMESTAMP(3);

-- Owner decision 14, option A (docs/UI_PARITY_MATRIX.md): backfill every
-- existing profile to its account's own creation time. There is no production
-- customer base yet (RESUME.md), so this asserts "already onboarded" for a
-- handful of demo/seed rows and nobody real. Going forward, new profiles are
-- created with onboarded_at NULL and it is set once, explicitly, when a
-- customer finishes or skips the welcome step (PATCH /api/v1/me { onboardedAt:
-- "now" }) — never inferred from account age again after this one-time backfill.
UPDATE "profiles" p
SET "onboarded_at" = u."created_at"
FROM "users" u
WHERE p."user_id" = u."id" AND p."onboarded_at" IS NULL;
