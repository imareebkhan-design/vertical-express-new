-- P1-4: rate limiter buckets
CREATE TABLE "rate_limits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bucket" TEXT NOT NULL,
  "hits" INTEGER NOT NULL DEFAULT 0,
  "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_limits_bucket_key" ON "rate_limits"("bucket");
-- RLS lockdown for the new table (owner/Prisma bypasses; anon blocked)
REVOKE ALL ON "rate_limits" FROM anon, authenticated;
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
