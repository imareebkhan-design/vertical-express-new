CREATE TABLE "order_emails" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "recipient" TEXT,
  "sender" TEXT,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "first_attempt_at" TIMESTAMP(3),
  "lease_until" TIMESTAMP(3),
  "lease_token" TEXT,
  "last_error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_emails_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_emails_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_emails_state_check" CHECK (state IN ('queued', 'sending', 'sent', 'failed', 'skipped'))
);
CREATE UNIQUE INDEX "order_emails_order_id_key" ON "order_emails"("order_id");
CREATE INDEX "order_emails_state_available_at_idx" ON "order_emails"("state", "available_at");
ALTER TABLE "order_emails" ENABLE ROW LEVEL SECURITY;
