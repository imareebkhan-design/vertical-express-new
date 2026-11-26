-- ISS-078. Additive and nullable: every existing row is valid, nothing is backfilled.
-- NULL means the payment-window expiry has never examined the order, so the
-- expiry takes it first. The expiry sets it when it claims an order; an order it
-- leaves pending therefore moves to the back of the queue instead of being
-- re-read ahead of every newer one.
ALTER TABLE "orders" ADD COLUMN "expiry_checked_at" TIMESTAMP(3);

-- The expiry's selection: status = pending_payment, ordered by expiry_checked_at
-- (NULLs first), then placed_at.
CREATE INDEX "orders_status_expiry_checked_at_placed_at_idx" ON "orders"("status", "expiry_checked_at", "placed_at");
