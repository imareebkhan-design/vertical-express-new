-- Payment exceptions (16 Nov 2026, roadmap A-3): a correctly signed Razorpay
-- capture the webhook could not settle — it matches no order here, or its amount
-- is not what the order's payment expects. Recorded so the webhook can answer 200
-- without losing the evidence; listed on the Payments screen.
-- Additive: one enum, one table. No existing row or column is changed. Every
-- statement is guarded, so a rerun is a no-op.
DO $$ BEGIN
  CREATE TYPE "PaymentExceptionReason" AS ENUM ('unmatched', 'amount_mismatch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "payment_exceptions" (
    "id" UUID NOT NULL,
    "reason" "PaymentExceptionReason" NOT NULL,
    "gateway_payment_id" TEXT NOT NULL,
    "gateway_order_id" TEXT,
    "gateway_event_id" TEXT,
    "event" TEXT NOT NULL,
    "amount_paise" INTEGER,
    "currency" TEXT,
    "expected_amount_paise" INTEGER,
    "order_id" UUID,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_exceptions_pkey" PRIMARY KEY ("id"),
    -- A mismatch is only evidence if it says what was captured, what was
    -- expected and which order claimed it.
    CONSTRAINT "payment_exceptions_mismatch_complete" CHECK (
      "reason" <> 'amount_mismatch'
      OR ("amount_paise" IS NOT NULL AND "expected_amount_paise" IS NOT NULL AND "order_id" IS NOT NULL)
    )
);

-- The idempotency guarantee: one row per gateway payment and reason. A webhook
-- replay, or two deliveries racing, insert nothing new (the loser gets P2002).
CREATE UNIQUE INDEX IF NOT EXISTS "payment_exceptions_gateway_payment_id_reason_key"
  ON "payment_exceptions"("gateway_payment_id", "reason");
CREATE INDEX IF NOT EXISTS "payment_exceptions_received_at_idx" ON "payment_exceptions"("received_at" DESC);
CREATE INDEX IF NOT EXISTS "payment_exceptions_order_id_idx" ON "payment_exceptions"("order_id");

DO $$ BEGIN
  ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same posture as the RLS lockdown: no policies, so the Supabase data API
-- (anon, authenticated) can never read or write these; Prisma connects as the
-- table owner and is unaffected.
ALTER TABLE "payment_exceptions" ENABLE ROW LEVEL SECURITY;
