
-- AlterEnum
ALTER TYPE "audit_actor" ADD VALUE 'driver';

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "firebase_uid" TEXT;

-- CreateTable
CREATE TABLE "shipment_live_locations" (
    "shipment_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION,
    "heading_deg" DOUBLE PRECISION,
    "speed_mps" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "last_sampled_at" TIMESTAMP(3),
    "route_computed_at" TIMESTAMP(3),
    "route_origin_lat" DOUBLE PRECISION,
    "route_origin_lng" DOUBLE PRECISION,
    "route_distance_m" INTEGER,
    "route_duration_s" INTEGER,
    "route_polyline" TEXT,
    "route_calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shipment_live_locations_pkey" PRIMARY KEY ("shipment_id")
);

-- CreateTable
CREATE TABLE "shipment_location_samples" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_location_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipment_live_locations_driver_id_idx" ON "shipment_live_locations"("driver_id");

-- CreateIndex
CREATE INDEX "shipment_location_samples_shipment_id_recorded_at_idx" ON "shipment_location_samples"("shipment_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_firebase_uid_key" ON "drivers"("firebase_uid");

-- AddForeignKey
ALTER TABLE "shipment_live_locations" ADD CONSTRAINT "shipment_live_locations_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_live_locations" ADD CONSTRAINT "shipment_live_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_location_samples" ADD CONSTRAINT "shipment_location_samples_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A coordinate outside the globe is a bug, never a position. The API validates
-- first; this makes the table refuse it whatever writes.
ALTER TABLE "shipment_live_locations" ADD CONSTRAINT "shipment_live_locations_coords_check"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "shipment_location_samples" ADD CONSTRAINT "shipment_location_samples_coords_check"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);

-- RLS lockdown for the new tables, as for every table: a driver's live position
-- must never be reachable through Supabase's PostgREST. Prisma (owner) bypasses.
REVOKE ALL ON "shipment_live_locations" FROM anon, authenticated;
ALTER TABLE "shipment_live_locations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "shipment_location_samples" FROM anon, authenticated;
ALTER TABLE "shipment_location_samples" ENABLE ROW LEVEL SECURITY;
