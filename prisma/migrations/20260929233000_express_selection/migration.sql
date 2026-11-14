-- E7: record the customer's express choice on the order and on the shipment that
-- carries it. Additive: a nullable column and a column with a default, no backfill
-- (orders placed before this have no express record, and none could be told apart).
ALTER TABLE "orders" ADD COLUMN "express_fee_paise" INTEGER;
ALTER TABLE "shipments" ADD COLUMN "express_run" BOOLEAN NOT NULL DEFAULT false;
