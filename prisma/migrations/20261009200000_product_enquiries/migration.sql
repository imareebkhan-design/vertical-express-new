-- Product enquiries for catalog-only products (owner-approved design, 9 Oct 2026).
CREATE TYPE "ProductEnquiryStatus" AS ENUM ('new', 'contacted', 'quoted', 'closed', 'spam');

CREATE TABLE "product_enquiries" (
    "id" UUID NOT NULL,
    "enquiry_no" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "product_title" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "quantity" TEXT,
    "message" TEXT,
    "status" "ProductEnquiryStatus" NOT NULL DEFAULT 'new',
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_enquiries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_enquiries_enquiry_no_key" ON "product_enquiries"("enquiry_no");
CREATE INDEX "product_enquiries_status_created_at_idx" ON "product_enquiries"("status", "created_at" DESC);
CREATE INDEX "product_enquiries_product_id_idx" ON "product_enquiries"("product_id");
CREATE INDEX "product_enquiries_phone_product_id_created_at_idx" ON "product_enquiries"("phone", "product_id", "created_at");

ALTER TABLE "product_enquiries" ADD CONSTRAINT "product_enquiries_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Customer names and phone numbers: no PostgREST access (same lockdown as the
-- other customer tables). The app reaches it only through Prisma.
ALTER TABLE "product_enquiries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "product_enquiries" FROM anon, authenticated;
