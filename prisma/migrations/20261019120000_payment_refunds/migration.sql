-- Payment refunds (19 Oct 2026, ISS-025): one row per refund of a captured payment.
-- Additive: one enum, one table. No existing row or column is changed. Every
-- statement is guarded, so a rerun is a no-op.
DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('requested', 'pending', 'processed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "payment_refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'requested',
    "gateway_refund_id" TEXT,
    "reason" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "failure" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_refunds_amount_positive" CHECK ("amount_paise" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_gateway_refund_id_key" ON "payment_refunds"("gateway_refund_id");
CREATE INDEX IF NOT EXISTS "payment_refunds_payment_id_idx" ON "payment_refunds"("payment_id");
CREATE INDEX IF NOT EXISTS "payment_refunds_order_id_idx" ON "payment_refunds"("order_id");
-- At most one refund per payment may be in flight: a double click, two
-- operators, or a retry after a crash can never ask Razorpay twice.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_one_in_flight" ON "payment_refunds"("payment_id")
  WHERE "status" IN ('requested', 'pending');

DO $$ BEGIN
  ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same posture as the RLS lockdown: no policies, so the Supabase data API
-- (anon, authenticated) can never read or write refunds; Prisma connects as
-- the table owner and is unaffected.
ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;
