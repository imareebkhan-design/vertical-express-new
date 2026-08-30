#!/usr/bin/env node
/**
 * Asset guard — ISS-044.
 *
 * The catalogue shipped real manufacturers' product photography under invented
 * Vertical Express brand names for months, and nothing in the pipeline noticed.
 * Two separate failures made that possible, and this guards both:
 *
 *   1. A branded file was referenced from the seed, so it became a product image.
 *   2. `seed.ts` fell back to a *category* composite for any product without its
 *      own photo — turning 6 branded files into 39 branded product listings.
 *
 * It also catches a third thing found during the same investigation: production
 * referenced `/categories/ceiling-fans-exhaust.webp`, which does not exist, so two
 * products rendered a broken image. A missing-file check would have caught it years
 * earlier than a person did.
 *
 * This checks the repository, not the database. Production rows are corrected as a
 * separate supervised operation.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");

/**
 * Files carrying prominent third-party marks, each verified by opening it.
 *
 * They remain in the repository on purpose — they still serve as category tiles,
 * which is tracked as follow-up — but none of them may illustrate a product.
 */
const BRANDED_BLOCKED = new Set([
  "/categories/cement.webp",
  "/categories/cpvc-pipes-overhead-tanks.webp",
  "/categories/fevicol.webp",
  "/categories/general-hardware-tools.webp",
  "/categories/home-appliances-power-backup.webp",
  "/categories/lighting.webp",
  "/categories/painting.webp",
  "/categories/tiling.webp",
  "/categories/waterproofing.webp",
  "/categories/wires-mcb-distribution-boards.webp",
]);

/**
 * Minor or partially legible marks. Retained as product images by an explicit owner
 * decision and scheduled for a later phase, so these are recorded rather than
 * enforced — the list exists so the next person knows they are not clean.
 */
const BRANDED_TRACKED = new Set([
  "/categories/conduits-gi-boxes.webp",
  "/categories/kitchen-sinks-faucets.webp",
  "/categories/plywood-mdf-hdhmr.webp",
  "/products/ss-kitchen-sink.webp",
]);

/** Directories whose contents must each have a provenance entry. */
const PROVENANCE_REQUIRED = ["products", "hero"];
const PROVENANCE_FILE = join(ROOT, "docs", "ASSET_PROVENANCE.md");

const failures = [];
const note = (msg) => failures.push(msg);

// --- 1. No seed product image may be a branded file --------------------------
const seedPath = join(ROOT, "prisma", "seed.ts");
const seed = readFileSync(seedPath, "utf8");
const seedRefs = [...seed.matchAll(/"(\/(?:products|categories)\/[^"]+)"/g)].map((m) => m[1]);

for (const ref of new Set(seedRefs)) {
  if (BRANDED_BLOCKED.has(ref)) {
    note(
      `prisma/seed.ts references a branded asset as a product image: ${ref}\n` +
        `      That file carries a third-party mark. A product must not be illustrated with it.`
    );
  }
}

// --- 2. The fallback must not be a category composite ------------------------
if (/url:\s*p\.image\s*\?\?\s*`\/categories\//.test(seed)) {
  note(
    "prisma/seed.ts falls back to a category image for products without their own.\n" +
      "      Category composites carry manufacturer marks; use the neutral placeholder."
  );
}

// --- 3. Every referenced image must exist ------------------------------------
const componentRefs = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
      walk(p);
    } else if (/\.(tsx?|mjs)$/.test(entry.name)) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/"(\/(?:products|categories|hero)\/[^"]+\.(?:webp|png|jpe?g|avif))"/g)) {
        componentRefs.push({ ref: m[1], file: p.replace(ROOT + "/", "") });
      }
    }
  }
}
for (const d of ["app", "components", "lib", "prisma"]) {
  const dir = join(ROOT, d);
  if (existsSync(dir)) walk(dir);
}

for (const { ref, file } of componentRefs) {
  if (!existsSync(join(PUBLIC, ref))) {
    note(`${file} references a missing image: ${ref}`);
  }
}

// --- 4. Provenance required for product-surface assets -----------------------
const provenance = existsSync(PROVENANCE_FILE) ? readFileSync(PROVENANCE_FILE, "utf8") : "";
if (!provenance) {
  note("docs/ASSET_PROVENANCE.md is missing. Every product-surface asset needs a recorded origin.");
} else {
  for (const dirName of PROVENANCE_REQUIRED) {
    const dir = join(PUBLIC, dirName);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!/\.(webp|png|jpe?g|avif)$/.test(f)) continue;
      const ref = `/${dirName}/${f}`;
      if (!provenance.includes(f)) {
        note(
          `public${ref} has no entry in docs/ASSET_PROVENANCE.md.\n` +
            `      Record where it came from and on what authority before committing it.`
        );
      }
    }
  }
}

// --- report ------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`\n✗ asset guard: ${failures.length} problem${failures.length > 1 ? "s" : ""}\n`);
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log(
  `✓ assets: no branded file used as a product image, no missing references, provenance recorded ` +
    `(${componentRefs.length} references checked, ${BRANDED_TRACKED.size} marks tracked)`
);
