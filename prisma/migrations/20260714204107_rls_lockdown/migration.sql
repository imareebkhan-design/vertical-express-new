-- RLS LOCKDOWN (P0-1)
-- The app connects to Postgres as the table OWNER (`postgres`) over the Supabase
-- pooler, and the owner bypasses RLS — so enabling RLS + revoking the exposed
-- API roles closes the Supabase REST backdoor WITHOUT affecting Prisma queries.
-- The browser only uses Supabase for auth (auth schema), never `.from(public.*)`,
-- so revoking public-table access from anon/authenticated is safe.

-- 1) Remove all direct REST/PostgREST access from the client-exposed roles.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 2) Same for any tables future Prisma migrations create (Prisma runs as `postgres`,
--    so default privileges granted "FOR ROLE postgres" are what leak new tables).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 3) Defense-in-depth: enable RLS on every application table. No policies are
--    created, so any non-owner role is denied by default. The owner (Prisma)
--    still bypasses RLS, so the app is unaffected. (No FORCE — FORCE would apply
--    RLS to the owner too and break the app.)
ALTER TABLE public.addresses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_price_tiers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serviceable_pincodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists            ENABLE ROW LEVEL SECURITY;
