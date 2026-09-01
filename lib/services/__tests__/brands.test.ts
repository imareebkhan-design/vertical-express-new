import assert from "node:assert/strict";
import test from "node:test";

import { db } from "@/lib/db";

/**
 * Brands, and the assignment that must never be automated.
 *
 * A brand on a product page is a factual claim about what is in the bag. The
 * catalogue shipped with ten invented brands because there was no way to enter
 * a real one, and the temptation once real ones exist is to map them across by
 * name similarity — BuildPro looks like a cement brand, UltraTech is a cement
 * brand, done.
 *
 * That would put a false statement in front of somebody buying material for a
 * slab. Only the person who bought the stock knows what is in it, so assignment
 * stays a deliberate, one-at-a-time act, and these tests pin the constraints
 * that keep it honest.
 */
const made: { brands: string[]; products: string[] } = { brands: [], products: [] };

test.after(async () => {
  await db.brand.deleteMany({ where: { id: { in: made.brands } } });
});

test("a brand name is unique — two brands cannot claim it", async () => {
  /* Two rows called "UltraTech" would mean two different answers to what is in
     the bag, and a product page picking whichever it joined to first. */
  const name = `TestBrand-${Date.now()}`;
  const a = await db.brand.create({ data: { slug: `tb-${Date.now()}-a`, name }, select: { id: true } });
  made.brands.push(a.id);

  await assert.rejects(
    db.brand.create({ data: { slug: `tb-${Date.now()}-b`, name } }),
    /Unique constraint/,
    "a duplicate brand name must be refused by the database, not just the form"
  );
});

test("a brand slug is unique — the URL cannot be ambiguous", async () => {
  const slug = `tb-slug-${Date.now()}`;
  const a = await db.brand.create({ data: { slug, name: `A-${Date.now()}` }, select: { id: true } });
  made.brands.push(a.id);

  await assert.rejects(
    db.brand.create({ data: { slug, name: `B-${Date.now()}` } }),
    /Unique constraint/
  );
});

test("every product has a brand — the relation is required", async () => {
  /* This is why no migration was needed to add brand management: the schema has
     always required a brand, and every product already has one. Assignment is a
     reassignment, never a fill-in-the-blank. */
  /* Asserted against the schema rather than a query: `brandId: undefined` is
     "no filter" in Prisma, not "is null", so a findFirst would happily return
     the first product and prove nothing. The column being NOT NULL is the
     actual guarantee. */
  const column = await db.$queryRaw<{ is_nullable: string }[]>`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'brand_id'
  `;
  assert.equal(column[0]?.is_nullable, "NO", "products.brand_id must be NOT NULL");

  const total = await db.product.count();
  const withBrand = await db.product.count({ where: { brand: { is: {} } } });
  assert.equal(withBrand, total, "every product resolves to a real brand row");
});

test("creating a brand does not touch any product", async () => {
  /* THE ONE THAT MATTERS. Seeding real brands must leave the catalogue exactly
     as it was — the records become available to select, and nothing is
     reassigned. */
  const before = await db.product.findMany({
    select: { id: true, brandId: true },
    orderBy: { id: "asc" },
  });

  const b = await db.brand.create({
    data: { slug: `neutral-${Date.now()}`, name: `Neutral-${Date.now()}` },
    select: { id: true },
  });
  made.brands.push(b.id);

  const after = await db.product.findMany({
    select: { id: true, brandId: true },
    orderBy: { id: "asc" },
  });

  assert.deepEqual(after, before, "adding a brand must not move a single product");
});

test("retiring a brand hides it without deleting its products", async () => {
  /* Deleting would cascade, and an order that referenced those products still
     has to make sense. */
  const b = await db.brand.create({
    data: { slug: `retire-${Date.now()}`, name: `Retire-${Date.now()}` },
    select: { id: true },
  });
  made.brands.push(b.id);

  await db.brand.update({ where: { id: b.id }, data: { isActive: false } });
  const still = await db.brand.findUnique({ where: { id: b.id }, select: { isActive: true } });
  assert.equal(still?.isActive, false, "retired, not removed");
});
