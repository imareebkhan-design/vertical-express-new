-- Clerk's user id, alongside the existing UUID primary key rather than
-- replacing it. Every Address, Order, Cart and Wallet row references users.id,
-- so retyping the primary key under live foreign keys would be a rewrite, not a
-- migration. Nullable through the expand phase: existing rows stay valid while
-- auth moves from Supabase to Clerk, and nothing has to be backfilled first.
ALTER TABLE "users" ADD COLUMN     "clerk_id" TEXT;

CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");
