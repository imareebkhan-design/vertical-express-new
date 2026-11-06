-- Baseline fixtures the test suite assumes already exist.
--
-- WHY THIS IS SEPARATE FROM prisma/seed.ts
--
-- The seed is the production catalogue: categories, brands, products, variants,
-- inventory, a warehouse, serviceable pincodes. It deliberately creates no
-- customers, no drivers and no vehicles, because a real deployment has none of
-- those on day one and the seed must not invent them.
--
-- The tests, however, assume all three. Ten test files call
-- `findFirstOrThrow` on a user, a vehicle or an order without creating one
-- first, so the suite only ever passed because earlier runs had left rows
-- behind. That made every backend verification ambiguous: a green run proved
-- the code worked *given whatever the last run happened to leave*, which is not
-- a baseline anybody can reason about.
--
-- So the fixtures live here, applied by setup-test-db.sh after the seed. They
-- are the minimum the suite assumes and nothing more — one of each, inert, with
-- recognisable values so a stray fixture row is obvious if one ever escapes
-- into a screenshot or a query result.

INSERT INTO users (id, phone, role, created_at, updated_at, firebase_uid)
SELECT gen_random_uuid(), '+919999900001', 'customer', now(), now(), 'test-fixture-customer'
WHERE NOT EXISTS (SELECT 1 FROM users);

INSERT INTO vehicles (id, registration, kind, is_active, created_at, updated_at)
SELECT gen_random_uuid(), 'TEST-FIXTURE-0001', 'van', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM vehicles);

INSERT INTO drivers (id, name, phone, is_active, created_at, updated_at)
SELECT gen_random_uuid(), 'Test Fixture Driver', '+919999900002', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM drivers);

-- The real brand records scripts/seed-real-brands.mjs creates (console-usable
-- names, deliberately assigned to zero products — see that script's header for
-- why). search-entry.test.ts asserts that a brand with nothing behind it is
-- never offered as a search shortcut; without a real brand that genuinely has
-- zero products, that assertion is vacuous. This is the same list, applied
-- here rather than by running the console script, so `npm test` is
-- self-contained.
INSERT INTO brands (id, slug, name, is_active, created_at, updated_at)
SELECT gen_random_uuid(), b.slug, b.name, true, now(), now()
FROM (VALUES
  ('ultratech', 'UltraTech'), ('acc', 'ACC'), ('ambuja', 'Ambuja'),
  ('kajaria', 'Kajaria'), ('somany', 'Somany'), ('asian-paints', 'Asian Paints'),
  ('havells', 'Havells'), ('finolex', 'Finolex'), ('century-ply', 'Century Ply'),
  ('jaquar', 'Jaquar'), ('hindware', 'Hindware')
) AS b(slug, name)
WHERE NOT EXISTS (SELECT 1 FROM brands WHERE brands.slug = b.slug);
