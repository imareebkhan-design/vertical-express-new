-- Data only. Until 11 Oct 2026 no order-cancel path touched the order's
-- shipments, so cancelled (and refunded) orders kept `pending`/`packed`
-- shipments that sat on the dispatch board as work to pack. Close them.
--
-- Stock is NOT touched: the order cancel already released it, and releasing it
-- here would count it twice. Reversible only by hand, and there is nothing to
-- reverse to — these shipments were never going to move.
UPDATE "shipments" s
SET    "status" = 'cancelled', "updated_at" = now()
FROM   "orders" o
WHERE  o."id" = s."order_id"
  AND  o."status" IN ('cancelled', 'refund_initiated', 'refunded')
  AND  s."status" IN ('pending', 'packed');
