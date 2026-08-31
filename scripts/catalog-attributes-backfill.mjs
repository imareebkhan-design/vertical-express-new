#!/usr/bin/env node
/**
 * Backfills product attributes and repairs product copy.
 *
 * Three things, all idempotent and all reversible:
 *
 *  1. Rewrites every product description. The seeded text promised each product
 *     was "delivered to your site in Srinagar within the hour" — on cement that
 *     travels by truck that contradicts the speed chip directly above it, and
 *     the 60-minute SLA is unverified in the placeholder register regardless. It
 *     also advertised "bulk prices unlock automatically", which the approved
 *     design removes from every frame. prisma/seed.ts was fixed; this brings
 *     existing rows into line.
 *
 *  2. Adds Type / Size / Finish / Room attributes to products that can carry
 *     them, so browse-by-attribute has something to browse.
 *
 *  3. Adds a tile range to Tiling, which held a cleaner, a grout and an
 *     adhesive — three consumables and no tiles.
 *
 * ON THE DATA: the catalogue is fictional (ISS-007) and these products are too.
 * Brands are the ones already seeded — no new brand names are invented, and no
 * real manufacturer is used, because none is confirmed. Prices are stand-ins in
 * the same sense every other price in this catalogue is. Sizes, finishes and IS
 * standards are ordinary product facts, which the placeholder register does not
 * mark.
 *
 * Every row it touches is written to a timestamped backup first.
 *
 * RE-RUN THIS AFTER `npm run db:seed`. The tile range lives here, not in
 * prisma/seed.ts, so a reseed drops it until this runs again.
 *
 *   node --env-file-if-exists=.env scripts/catalog-attributes-backfill.mjs
 *   node --env-file-if-exists=.env scripts/catalog-attributes-backfill.mjs --revert <backup.json>
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const db = new PrismaClient();
const BACKUP_DIR = join(process.cwd(), ".catalog-backups");

/** Attributes for products already in the catalogue, read off their own titles. */
const EXISTING_ATTRS = {
  "ppc-cement-50kg": [
    { label: "Grade", value: "PPC" },
    { label: "Standard", value: "IS 1489 Part 1" },
    { label: "Weight", value: "50 kg" },
  ],
  "opc-53-cement-50kg": [
    { label: "Grade", value: "OPC 53" },
    { label: "Standard", value: "IS 269" },
    { label: "Weight", value: "50 kg" },
  ],
  "white-cement-5kg": [
    { label: "Grade", value: "White cement" },
    { label: "Weight", value: "5 kg" },
  ],
  "ready-mix-plaster-40kg": [
    { label: "Grade", value: "Ready-mix plaster" },
    { label: "Weight", value: "40 kg" },
  ],
  "led-batten-20w": [
    { label: "Type", value: "Batten" },
    { label: "Wattage", value: "20 W" },
    { label: "Colour", value: "Cool day light" },
  ],
  "led-downlight-12w": [
    { label: "Type", value: "Downlight" },
    { label: "Wattage", value: "12 W" },
    { label: "Colour", value: "Warm white" },
  ],
  "acrylic-distemper-20kg": [
    { label: "Finish", value: "Matt" },
    { label: "Base", value: "Acrylic distemper" },
    { label: "Volume", value: "20 kg" },
  ],
  "weatherproof-exterior-emulsion-20l": [
    { label: "Finish", value: "Sheen" },
    { label: "Base", value: "Exterior emulsion" },
    { label: "Volume", value: "20 L" },
  ],
  "acrylic-wall-putty-40kg": [
    { label: "Finish", value: "Matt" },
    { label: "Base", value: "Wall putty" },
    { label: "Volume", value: "40 kg" },
  ],
};

/** The tile range. Tiling had no tiles in it. */
const TILES = [
  { slug: "vitrified-floor-tile-ivory-600", title: "Vitrified Floor Tile, Ivory", brand: "homecrown", pricePaise: 112000, compareAtPaise: 119000, unitLabel: "per box of 4", type: "Vitrified", size: "600 × 600 mm", finish: "Matt", room: "Floor" },
  { slug: "vitrified-floor-tile-grey-600", title: "Vitrified Floor Tile, Grey", brand: "homecrown", pricePaise: 114000, compareAtPaise: null, unitLabel: "per box of 4", type: "Vitrified", size: "600 × 600 mm", finish: "Matt", room: "Floor" },
  { slug: "glazed-vitrified-carrara-600", title: "Glazed Vitrified Tile, Carrara", brand: "homecrown", pricePaise: 134000, compareAtPaise: 139000, unitLabel: "per box of 4", type: "Glazed vitrified", size: "600 × 600 mm", finish: "Gloss", room: "Floor" },
  { slug: "double-charge-vitrified-grey-800", title: "Double-charge Vitrified Tile, Grey", brand: "homecrown", pricePaise: 234000, compareAtPaise: 249000, unitLabel: "per box of 3", type: "Double-charge vitrified", size: "800 × 800 mm", finish: "Polished", room: "Floor" },
  { slug: "glazed-wall-tile-bone-300x600", title: "Glazed Wall Tile, Bone", brand: "homecrown", pricePaise: 69000, compareAtPaise: null, unitLabel: "per box of 6", type: "Glazed ceramic", size: "300 × 600 mm", finish: "Gloss", room: "Wall" },
  { slug: "glazed-wall-tile-white-300x600", title: "Glazed Wall Tile, White", brand: "homecrown", pricePaise: 66000, compareAtPaise: null, unitLabel: "per box of 6", type: "Glazed ceramic", size: "300 × 600 mm", finish: "Gloss", room: "Wall" },
  { slug: "subway-wall-tile-white-75x300", title: "Subway Wall Tile, White", brand: "homecrown", pricePaise: 82000, compareAtPaise: 88000, unitLabel: "per box of 8", type: "Glazed ceramic", size: "75 × 300 mm", finish: "Gloss", room: "Wall" },
  { slug: "anti-skid-bathroom-tile-300", title: "Anti-skid Bathroom Floor Tile", brand: "gripfast", pricePaise: 56000, compareAtPaise: null, unitLabel: "per box of 9", type: "Ceramic", size: "300 × 300 mm", finish: "Rustic / anti-skid", room: "Bathroom" },
  { slug: "anti-skid-bathroom-tile-slate-300", title: "Anti-skid Bathroom Tile, Slate", brand: "gripfast", pricePaise: 58000, compareAtPaise: 62000, unitLabel: "per box of 9", type: "Ceramic", size: "300 × 300 mm", finish: "Rustic / anti-skid", room: "Bathroom" },
  { slug: "elevation-tile-slate-300x450", title: "Elevation Tile, Slate", brand: "gripfast", pricePaise: 84000, compareAtPaise: null, unitLabel: "per box of 8", type: "Ceramic", size: "300 × 450 mm", finish: "Textured", room: "Elevation" },
  { slug: "elevation-tile-stone-300x450", title: "Elevation Tile, Stone", brand: "gripfast", pricePaise: 86000, compareAtPaise: null, unitLabel: "per box of 8", type: "Ceramic", size: "300 × 450 mm", finish: "Textured", room: "Elevation" },
  { slug: "wooden-finish-plank-tile-200x1200", title: "Wooden-finish Plank Tile", brand: "timbercraft", pricePaise: 148000, compareAtPaise: null, unitLabel: "per box of 5", type: "Vitrified", size: "200 × 1200 mm", finish: "Matt", room: "Floor" },
  { slug: "moroccan-pattern-wall-tile-200", title: "Moroccan Pattern Wall Tile", brand: "homecrown", pricePaise: 96000, compareAtPaise: 104000, unitLabel: "per box of 11", type: "Glazed ceramic", size: "200 × 200 mm", finish: "Matt", room: "Wall" },
  { slug: "ceramic-floor-tile-beige-400", title: "Ceramic Floor Tile, Beige", brand: "gripfast", pricePaise: 48000, compareAtPaise: null, unitLabel: "per box of 6", type: "Ceramic", size: "400 × 400 mm", finish: "Matt", room: "Floor" },
];

const PLACEHOLDER_IMAGE = "/placeholder-product.webp";

/** The honest description — no delivery time, no bulk-pricing claim. */
const describe = (title, brandName) => `${title} — ${brandName}, supplied for site delivery in Srinagar.`;

async function revert(file) {
  const backup = JSON.parse(readFileSync(file, "utf8"));
  for (const row of backup.products) {
    await db.product.update({
      where: { id: row.id },
      data: { description: row.description, specs: row.specs ?? undefined },
    });
  }
  for (const slug of backup.createdProductSlugs ?? []) {
    await db.product.deleteMany({ where: { slug } });
  }
  console.log(
    `Reverted ${backup.products.length} product(s) and removed ${(backup.createdProductSlugs ?? []).length} added product(s).`
  );
}

async function main() {
  const revertIdx = process.argv.indexOf("--revert");
  if (revertIdx !== -1) return revert(process.argv[revertIdx + 1]);

  mkdirSync(BACKUP_DIR, { recursive: true });

  const existing = await db.product.findMany({
    select: { id: true, slug: true, title: true, description: true, specs: true, brand: { select: { name: true } } },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(BACKUP_DIR, `catalog-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        products: existing.map((p) => ({ id: p.id, slug: p.slug, description: p.description, specs: p.specs })),
        createdProductSlugs: TILES.map((t) => t.slug),
      },
      null,
      2
    )
  );
  console.log(`Backup written: ${backupPath}`);

  // 1 + 2. Honest descriptions, and attributes where we have them.
  let described = 0;
  let attributed = 0;
  for (const p of existing) {
    const next = describe(p.title, p.brand.name);
    const attrs = EXISTING_ATTRS[p.slug];
    if (p.description === next && !attrs) continue;
    await db.product.update({
      where: { id: p.id },
      data: { description: next, ...(attrs ? { specs: attrs } : {}) },
    });
    if (p.description !== next) described++;
    if (attrs) attributed++;
  }
  console.log(`Descriptions rewritten: ${described}. Attributes added to existing products: ${attributed}.`);

  // 3. The tile range.
  const category = await db.category.findFirstOrThrow({ where: { slug: "tiling" } });
  const warehouse = await db.warehouse.findFirstOrThrow();
  const brands = new Map((await db.brand.findMany()).map((b) => [b.slug, b]));

  let created = 0;
  for (const t of TILES) {
    const brand = brands.get(t.brand);
    if (!brand) throw new Error(`Unknown brand ${t.brand} — refusing to invent one.`);

    const specs = [
      { label: "Type", value: t.type },
      { label: "Size", value: t.size },
      { label: "Finish", value: t.finish },
      { label: "Room", value: t.room },
    ];

    const product = await db.product.upsert({
      where: { slug: t.slug },
      update: { specs, description: describe(t.title, brand.name) },
      create: {
        slug: t.slug,
        title: t.title,
        brandId: brand.id,
        categoryId: category.id,
        unitLabel: t.unitLabel,
        specs,
        description: describe(t.title, brand.name),
        images: { create: { url: PLACEHOLDER_IMAGE, alt: t.title, isPrimary: true } },
      },
    });

    const sku = `VE-${t.slug.toUpperCase()}`;
    const variant = await db.productVariant.upsert({
      where: { sku },
      update: { pricePaise: t.pricePaise, compareAtPaise: t.compareAtPaise },
      create: {
        productId: product.id,
        sku,
        name: t.title,
        isDefault: true,
        pricePaise: t.pricePaise,
        compareAtPaise: t.compareAtPaise,
      },
    });

    await db.inventory.upsert({
      where: { variantId_warehouseId: { variantId: variant.id, warehouseId: warehouse.id } },
      update: {},
      create: { variantId: variant.id, warehouseId: warehouse.id, qtyOnHand: 500, qtyReserved: 0 },
    });
    created++;
  }
  console.log(`Tiles upserted: ${created}.`);
  console.log(`\nTo undo:\n  node --env-file-if-exists=.env scripts/catalog-attributes-backfill.mjs --revert ${backupPath}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
