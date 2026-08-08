-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('cashback_credit', 'order_debit', 'refund_credit', 'expired');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cgst_paise" INTEGER,
ADD COLUMN     "discount_paise" INTEGER,
ADD COLUMN     "gst_rate" DECIMAL(5,2),
ADD COLUMN     "hsn_code" TEXT,
ADD COLUMN     "igst_paise" INTEGER,
ADD COLUMN     "sgst_paise" INTEGER,
ADD COLUMN     "subtotal_paise" INTEGER,
ADD COLUMN     "taxable_value_paise" INTEGER,
ADD COLUMN     "total_paise" INTEGER;

-- AlterTable
ALTER TABLE "rate_limits" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance_paise" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "reference_id" TEXT,
    "description" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synonyms" (
    "id" UUID NOT NULL,
    "word" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_reference_id_type_key" ON "wallet_transactions"("reference_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "synonyms_word_key" ON "synonyms"("word");

-- CreateIndex
CREATE INDEX "payments_gateway_order_id_idx" ON "payments"("gateway_order_id");

-- CreateIndex
CREATE INDEX "payments_gateway_payment_id_idx" ON "payments"("gateway_payment_id");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
