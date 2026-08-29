#!/usr/bin/env node
/**
 * Product description copy — strip unverified delivery claims.
 *
 * Every seeded description ends "...delivered to your site in Srinagar within
 * the hour." That is a promise the system cannot keep: speed is per product and
 * comes from Category.isBulk, so a bag of cement — which ships by truck and
 * shows "Heavy — by truck" on the very same page — was still promising an hour
 * in its own description.
 *
 * This REMOVES the claim rather than rewriting the sentence, so the owner's
 * wording survives and only the false part goes. The product page already
 * carries a SpeedChip, which states delivery accurately per item.
 *
 * ── Changing the rule later ─────────────────────────────────────────────────
 * Edit TRANSFORM below and re-run. Same three modes as the category script:
 *
 *   node scripts/product-copy.mjs                 # dry run — shows the diff, writes nothing
 *   node scripts/product-copy.mjs --apply         # writes, after saving a backup
 *   node scripts/product-copy.mjs --restore <f>   # rolls back from a backup file
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

// ── The rule. Change this and re-run. ─────────────────────────────────────────
const TRANSFORM = (text) =>
  (text ?? "")
    // "delivered to your site in Srinagar within the hour." -> keep the place, drop the time
    .replace(/\s*within the hour\b/gi, "")
    // any other stray speed claims in seeded copy
    .replace(/\s*,?\s*(delivered\s+)?(super\s*fast|superfast)\b/gi, "")
    .replace(/\s*in (?:just )?60\s*(?:-|\s)?min(?:ute)?s?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
// ──────────────────────────────────────────────────────────────────────────────

const db = new PrismaClient();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const restoreIdx = args.indexOf("--restore");

async function restore(file) {
  const rows = JSON.parse(readFileSync(file, "utf8"));
  for (const r of rows) {
    await db.product.update({ where: { id: r.id }, data: { description: r.description } });
  }
  console.log(`restored ${rows.length} products from ${file}`);
}

async function main() {
  if (restoreIdx !== -1) {
    const f = args[restoreIdx + 1];
    if (!f) throw new Error("--restore needs a backup file path");
    return restore(f);
  }

  const products = await db.product.findMany({
    select: { id: true, slug: true, description: true },
    orderBy: { slug: "asc" },
  });

  const changes = products
    .map((p) => ({ ...p, next: TRANSFORM(p.description) }))
    .filter((p) => p.next !== (p.description ?? ""));

  if (!changes.length) {
    console.log(`✓ all ${products.length} product descriptions already clean`);
    return;
  }

  console.log(`${changes.length} of ${products.length} products carry a claim to remove:\n`);
  for (const c of changes.slice(0, 5)) {
    console.log(`  ${c.slug}`);
    console.log(`    - ${c.description}`);
    console.log(`    + ${c.next}\n`);
  }
  if (changes.length > 5) console.log(`  … and ${changes.length - 5} more, same pattern\n`);

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply to commit.");
    return;
  }

  mkdirSync(".seo-backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `.seo-backups/products-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(products, null, 2));
  console.log(`backup written: ${backup}`);

  for (const c of changes) {
    await db.product.update({ where: { id: c.id }, data: { description: c.next } });
  }
  console.log(`✓ updated ${changes.length} products`);
  console.log(`  roll back with: node scripts/product-copy.mjs --restore ${backup}`);
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
