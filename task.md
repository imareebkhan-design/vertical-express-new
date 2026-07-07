# Execution Checklist

## Milestone 0 — Foundation
- [x] Install prisma@6, @prisma/client, @supabase/supabase-js, @supabase/ssr, zod, tsx
- [x] prisma/schema.prisma — identity + catalog + commerce core (21 models), validated
- [x] prisma/seed.ts — 20 categories, 10 brands, 45 products w/ variants + bulk tiers, warehouse, 25 Srinagar pincodes, FIRST3 coupon
- [x] lib/db.ts, lib/money.ts, lib/validators/index.ts (ActionResult envelope)
- [x] lib/supabase/server.ts + client.ts (@supabase/ssr, async cookies)
- [x] .env.example; db scripts in package.json; typecheck green
- [ ] **BLOCKED on user**: `npx supabase login --token "$(pbpaste)"` (token in clipboard)
- [ ] Create Supabase project (ap-south-1) via CLI; write .env
- [ ] `prisma migrate dev` + `prisma db seed` against cloud DB
- [ ] Verify: query products from a scratch script

## Milestone 1 — Authentication → not started
## Milestone 2 — PLP + Category pages → not started
## Milestone 3 — PDP → not started
## Milestone 4 — Search + Filters → not started
## Milestone 5 — Cart + Wishlist → not started
## Milestone 6 — Addresses → not started
## Milestone 7 — Checkout (dummy gateway) + Confirmation → not started
## Milestone 8 — My Orders + Dashboard → not started
