-- Three additions the app design canvas needs and the schema had no room for.
-- All additive and nullable: expand phase, nothing stops being written, and a
-- rollback loses no data.

-- 1. What the driver needs to reach the gate.
--    Srinagar addresses are landmark-navigated; "Plot 42, near Bypass Junction"
--    gets a truck to the road but not to the unloading point. Free text on
--    purpose — no structured field would capture "narrow lane, small vehicle
--    only".
ALTER TABLE "addresses" ADD COLUMN "access_note" TEXT;

-- 2. What the customer is buying as.
--    Deliberately NOT the existing "Role" enum. Role is authorization — what a
--    principal may do. This is merchandising — what they are shown first. A
--    contractor and a homeowner have identical permissions and completely
--    different home screens, so conflating them would couple a UI decision to
--    an access-control one.
CREATE TYPE "BuyerType" AS ENUM ('contractor', 'homeowner', 'designer');
ALTER TABLE "profiles" ADD COLUMN "buyer_type" "BuyerType";

-- 3. The room taxonomy.
--    Homeowners shop by room; contractors shop by trade. Both reach the same
--    categories from opposite directions, so this is a second index over the
--    existing catalog rather than a second catalog.
--
--    An explicit join table rather than an implicit many-to-many because the
--    ordering is editorial: Bathroom leads with sanitaryware, not with whatever
--    sorts first. Tiling appears in every room, so the relation cannot live on
--    categories.
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rooms_slug_key" ON "rooms"("slug");
CREATE INDEX "rooms_sort_order_idx" ON "rooms"("sort_order");

CREATE TABLE "room_categories" (
    "room_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "room_categories_pkey" PRIMARY KEY ("room_id","category_id")
);

CREATE INDEX "room_categories_room_id_sort_order_idx" ON "room_categories"("room_id", "sort_order");

ALTER TABLE "room_categories" ADD CONSTRAINT "room_categories_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_categories" ADD CONSTRAINT "room_categories_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
