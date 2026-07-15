-- Add GST/tax column to orders (P1-2, demo GST engine).
-- Additive, defaulted → safe on existing rows.
ALTER TABLE "orders" ADD COLUMN "tax_paise" INTEGER NOT NULL DEFAULT 0;
