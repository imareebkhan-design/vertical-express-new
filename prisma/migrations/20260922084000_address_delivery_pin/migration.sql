ALTER TABLE "addresses" ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_delivery_pin_range"
CHECK ((latitude IS NULL AND longitude IS NULL) OR
  (latitude IS NOT NULL AND longitude IS NOT NULL AND
   latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));
