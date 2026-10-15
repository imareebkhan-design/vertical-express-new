-- Return requests (15 Oct 2026): intake and non-monetary review only.
-- Additive: two new tables, two enums, and an index on orders.placed_at for
-- the Orders console's default sort and date filters. No existing row or
-- column is changed. Every statement is guarded, so a rerun is a no-op.
DO $$ BEGIN
  CREATE TYPE "return_status" AS ENUM ('requested', 'under_review', 'inspecting', 'approved', 'rejected', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "return_reason" AS ENUM ('damaged_in_transit', 'wrong_item', 'defective', 'short_quantity', 'not_needed', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "return_requests" (
    "id" UUID NOT NULL,
    "return_no" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "return_status" NOT NULL DEFAULT 'requested',
    "reason" "return_reason" NOT NULL,
    "explanation" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "return_request_items" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    CONSTRAINT "return_request_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "return_request_items_qty_positive" CHECK ("qty" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "return_requests_return_no_key" ON "return_requests"("return_no");
CREATE INDEX IF NOT EXISTS "return_requests_order_id_idx" ON "return_requests"("order_id");
CREATE INDEX IF NOT EXISTS "return_requests_status_requested_at_idx" ON "return_requests"("status", "requested_at");
CREATE INDEX IF NOT EXISTS "return_request_items_order_item_id_idx" ON "return_request_items"("order_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "return_request_items_return_request_id_order_item_id_key" ON "return_request_items"("return_request_id", "order_item_id");
CREATE INDEX IF NOT EXISTS "orders_placed_at_idx" ON "orders"("placed_at" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_requests_order_id_fkey') THEN
    ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_request_items_return_request_id_fkey') THEN
    ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_request_items_order_item_id_fkey') THEN
    ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
