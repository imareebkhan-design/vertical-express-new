-- Service areas by city (15 Oct 2026). Until now every serviceable pincode
-- was implicitly Srinagar. A city can now be switched live or off as a whole,
-- and each pincode in it included or excluded on its own row.
--
-- Backfill: every existing pincode joins the city its warehouse is in, and
-- that city is LIVE — so nothing a customer can buy today changes. Only two
-- columns are ADDED to serviceable_pincodes; no existing column (warehouse,
-- fee, ETA, COD, is_active) is touched, and orders are not touched at all.
-- Every warehouse with pincodes today is in Jammu & Kashmir (Srinagar Central
-- is the only one on staging), hence the backfilled state.
--
-- Rerunnable: every statement is guarded, so applying it twice (or after a
-- partial apply) leaves the same result.
CREATE TABLE IF NOT EXISTS "service_cities" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT         NOT NULL,
    "state"      TEXT         NOT NULL,
    "is_live"    BOOLEAN      NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_cities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "service_cities_name_key" ON "service_cities"("name");

ALTER TABLE "serviceable_pincodes" ADD COLUMN IF NOT EXISTS "city_id" UUID;
ALTER TABLE "serviceable_pincodes" ADD COLUMN IF NOT EXISTS "area" TEXT;

INSERT INTO "service_cities" ("name", "state", "is_live", "updated_at")
SELECT DISTINCT w."city", 'Jammu & Kashmir', true, now()
FROM "serviceable_pincodes" sp JOIN "warehouses" w ON w."id" = sp."warehouse_id"
WHERE sp."city_id" IS NULL
ON CONFLICT ("name") DO NOTHING;

UPDATE "serviceable_pincodes" sp
SET    "city_id" = c."id"
FROM   "warehouses" w, "service_cities" c
WHERE  w."id" = sp."warehouse_id" AND c."name" = w."city" AND sp."city_id" IS NULL;

ALTER TABLE "serviceable_pincodes" ALTER COLUMN "city_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "serviceable_pincodes_city_id_idx" ON "serviceable_pincodes"("city_id");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'serviceable_pincodes_city_id_fkey') THEN
    ALTER TABLE "serviceable_pincodes" ADD CONSTRAINT "serviceable_pincodes_city_id_fkey"
      FOREIGN KEY ("city_id") REFERENCES "service_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
