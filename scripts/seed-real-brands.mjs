#!/usr/bin/env node
/**
 * Creates the real brand records the design canvas uses.
 *
 * WHAT THIS DOES AND DELIBERATELY DOES NOT DO
 *
 * It creates brand *records* so they can be selected in the console. It does
 * NOT reassign any existing product to a real brand.
 *
 * That distinction is the whole point. Which fictional brand maps to which real
 * one — is "BuildPro cement" an UltraTech, an ACC or an Ambuja? — is a fact
 * about what is physically in the warehouse, and only the owner knows it. A
 * brand on a product page is a claim about what is in the bag, so guessing it
 * would put a wrong claim in front of a customer buying material for a slab.
 *
 * After running this, assign products to brands in the console, one at a time,
 * from what you actually stock.
 *
 * Names only, no logos. The right to say you stock a brand and the right to
 * reproduce its logo and packaging photography are licensed separately
 * (ISS-044).
 *
 * Idempotent — safe to run more than once.
 *
 *   node scripts/seed-real-brands.mjs
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** As they appear in design-canvas/. Extend in the console, not here. */
const BRANDS = [
  { slug: "ultratech", name: "UltraTech" },
  { slug: "acc", name: "ACC" },
  { slug: "ambuja", name: "Ambuja" },
  { slug: "kajaria", name: "Kajaria" },
  { slug: "somany", name: "Somany" },
  { slug: "asian-paints", name: "Asian Paints" },
  { slug: "havells", name: "Havells" },
  { slug: "finolex", name: "Finolex" },
  { slug: "century-ply", name: "Century Ply" },
  { slug: "jaquar", name: "Jaquar" },
  { slug: "hindware", name: "Hindware" },
];

async function main() {
  let created = 0;
  for (const b of BRANDS) {
    const existing = await db.brand.findUnique({ where: { slug: b.slug } });
    if (existing) {
      console.log(`  = ${b.name} already exists`);
      continue;
    }
    await db.brand.create({ data: { slug: b.slug, name: b.name, isActive: true } });
    console.log(`  + ${b.name}`);
    created += 1;
  }

  const unassigned = await db.brand.findMany({
    where: { slug: { in: BRANDS.map((b) => b.slug) } },
    select: { name: true, _count: { select: { products: true } } },
  });
  const empty = unassigned.filter((b) => b._count.products === 0).length;

  console.log(`\n  ${created} created, ${BRANDS.length - created} already present.`);
  console.log(`  ${empty} of them have no products yet — assign products in the console`);
  console.log(`  at /admin/products. Nothing has been reassigned automatically, because`);
  console.log(`  which real brand a product actually is only you can say.\n`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
