-- Additive: a reason for stock put back by a cancellation before dispatch.
-- Checkout and the cancel paths now write a stock_movements row for every
-- change they make; this is the reason the cancel paths use. No existing row
-- changes. An enum value cannot be dropped cheaply, so rollback is code-only:
-- older code never writes or reads 'released' and is unaffected by it.
ALTER TYPE "StockMovementReason" ADD VALUE 'released';
