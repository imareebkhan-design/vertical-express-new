ALTER TABLE "payments" ADD COLUMN "callback_payment_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
