-- Additive and nullable: existing addresses keep working unchanged.
-- Google's pincode for the address's pin, recorded at save (issue #1, acceptance 7).
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "pin_pincode" CHAR(6);
