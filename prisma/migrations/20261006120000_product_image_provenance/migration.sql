-- Image provenance (Task 6). Additive: nullable columns, no backfill. Existing images
-- (the demo placeholders) simply have no recorded source. The unique index lets an
-- image import be re-run without duplicating a picture; rows with a null sha256 are
-- not constrained by it (Postgres treats NULLs as distinct).
ALTER TABLE "product_images" ADD COLUMN "source_url" TEXT;
ALTER TABLE "product_images" ADD COLUMN "licence" TEXT;
ALTER TABLE "product_images" ADD COLUMN "width" INTEGER;
ALTER TABLE "product_images" ADD COLUMN "height" INTEGER;
ALTER TABLE "product_images" ADD COLUMN "sha256" CHAR(64);
CREATE UNIQUE INDEX "product_images_product_id_sha256_key" ON "product_images"("product_id", "sha256");
