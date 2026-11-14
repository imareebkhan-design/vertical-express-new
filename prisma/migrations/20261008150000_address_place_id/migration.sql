-- Additive and nullable: existing addresses keep working unchanged.
ALTER TABLE "addresses" ADD COLUMN "place_id" TEXT;
