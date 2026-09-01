-- Operational settings the console edits, and per-product delivery speed.
-- Both additive and nullable. Nothing stops being written; a rollback loses
-- nothing that was not entered through the new screens.

-- 1. Settings.
--    The cashback rate, the GST registration, the delivery windows and the
--    default catalogue sort are business decisions that change without a
--    deploy. Every one of them was a constant in a source file or an
--    environment variable — and in the case of the 5% cashback, that meant
--    nobody noticed it was paying out at all (ISS-055).
--
--    A typed key/value table rather than a column per setting: these are read
--    rarely, edited by hand, and the set grows. A column per setting turns
--    every new toggle into a migration.
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- 2. Per-product delivery speed.
--    Speed has been derived from Category.isBulk — every cement heavy, every
--    switch fast. That holds for most of the catalogue and breaks at the edges:
--    a 5 kg bag of white cement does not need a truck, and a 40-piece box of
--    tiles does.
--
--    NULL means "use the category", which is what almost every row should say.
--    Deliberately nullable rather than defaulted, so an override is a decision
--    somebody made rather than a value that got inherited.
CREATE TYPE "DeliverySpeed" AS ENUM ('express', 'scheduled');
ALTER TABLE "products" ADD COLUMN "delivery_speed" "DeliverySpeed";
