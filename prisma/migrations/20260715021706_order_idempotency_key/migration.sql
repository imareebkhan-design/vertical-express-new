-- P0-6: idempotency key for order placement (dedupes retries/refresh/double-submit)
ALTER TABLE "orders" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");
