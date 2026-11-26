-- AlterTable
ALTER TABLE "products" ADD COLUMN     "express_eligible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_express_pincodes" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "pincode" CHAR(6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_express_pincodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_express_pincodes_pincode_idx" ON "product_express_pincodes"("pincode");

-- CreateIndex
CREATE UNIQUE INDEX "product_express_pincodes_product_id_pincode_key" ON "product_express_pincodes"("product_id", "pincode");

-- AddForeignKey
ALTER TABLE "product_express_pincodes" ADD CONSTRAINT "product_express_pincodes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
