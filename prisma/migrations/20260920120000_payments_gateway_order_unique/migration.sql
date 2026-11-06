-- A Razorpay order id names exactly one payment row: `placeOrder` creates one
-- gateway order per local order and writes one Payment for it, and every
-- confirmation and webhook path looks the row up by this column. Nothing
-- enforced that, so a duplicate would make a lookup non-deterministic.
--
-- The plain index is replaced by a unique one (which also serves lookups).
-- NULLs stay allowed and repeatable: COD orders have no gateway order.
--
-- PRODUCTION PREREQUISITE. This statement FAILS if duplicates exist, and that
-- is the intended behaviour — do not "fix" it by deleting rows. Run first:
--   SELECT gateway_order_id, count(*) FROM payments
--   WHERE gateway_order_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- and resolve any rows by hand before deploying.
DROP INDEX IF EXISTS "payments_gateway_order_id_idx";
CREATE UNIQUE INDEX "payments_gateway_order_id_key" ON "payments"("gateway_order_id");
