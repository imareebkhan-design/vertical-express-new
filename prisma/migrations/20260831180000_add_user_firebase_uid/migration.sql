-- Firebase Auth's uid, alongside the UUID primary key rather than replacing it.
-- Address, Order, Cart and Wallet all reference users.id; retyping a primary key
-- under live foreign keys is a rewrite, not a migration.
--
-- clerk_id is deliberately left in place. This is the expand phase: both columns
-- coexist so a rollback to Clerk does not lose the mapping. clerk_id drops in a
-- later release, once nothing reads it.
ALTER TABLE "users" ADD COLUMN     "firebase_uid" TEXT;

CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
