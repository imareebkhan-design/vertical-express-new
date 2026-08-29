#!/usr/bin/env node
/**
 * Category SEO copy — set, review and roll back.
 *
 * `Category.seoTitle` / `seoDescription` are read straight into the page
 * <title> and <meta description> by app/(shop)/category/[slug]/page.tsx, so
 * these two columns are what Google indexes. They are DATA, not code, which is
 * why the claim sweep that cleaned the storefront never reached them.
 *
 * This script exists instead of a re-seed because `prisma db seed` also upserts
 * Inventory, and would reset live stock levels to seeded quantities.
 *
 * ── Changing the wording later ──────────────────────────────────────────────
 * Edit TEMPLATE below and re-run. That is the only place the copy lives.
 * Nothing else needs to change.
 *
 *   node scripts/category-seo.mjs                 # dry run — shows the diff, writes nothing
 *   node scripts/category-seo.mjs --apply         # writes, after saving a backup
 *   node scripts/category-seo.mjs --restore <f>   # rolls back from a backup file
 *
 * Every --apply writes .seo-backups/<timestamp>.json first, so any run can be
 * undone exactly.
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

// ── The copy. Change these two functions and re-run. ───────────────────────────
// Deliberately claim no delivery time: speed is per product and comes from the
// SpeedChip, which is the only thing that knows whether goods travel by bike or
// by truck. A time here would be a promise the backend cannot keep.
const TITLE_LIMIT = 60; // what Google renders before truncating
const TEMPLATE = {
  // Long category names ("Wires, MCB & Distribution Boards") blow past 60 chars
  // once the brand suffix is added, and a truncated title loses the brand
  // anyway — so the suffix is dropped rather than cut. The category name and
  // the city are what carry the search intent; keep those whole.
  title: (name) => {
    const full = `${name} in Srinagar | Vertical Express`;
    return full.length <= TITLE_LIMIT ? full : `${name} in Srinagar`;
  },
  description: (name) =>
    `Buy ${name.toLowerCase()} at trade prices in Srinagar. Delivery speed is shown on every product.`,
};
// ──────────────────────────────────────────────────────────────────────────────

const db = new PrismaClient();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const restoreIdx = args.indexOf("--restore");

function truncWarn(label, s, limit) {
  return s.length > limit ? `  ⚠ ${label} ${s.length} chars, Google renders ~${limit}` : null;
}

async function restore(file) {
  const rows = JSON.parse(readFileSync(file, "utf8"));
  for (const r of rows) {
    await db.category.update({
      where: { id: r.id },
      data: { seoTitle: r.seoTitle, seoDescription: r.seoDescription },
    });
  }
  console.log(`restored ${rows.length} categories from ${file}`);
}

async function main() {
  if (restoreIdx !== -1) {
    const f = args[restoreIdx + 1];
    if (!f) throw new Error("--restore needs a backup file path");
    return restore(f);
  }

  const cats = await db.category.findMany({
    select: { id: true, name: true, slug: true, seoTitle: true, seoDescription: true },
    orderBy: { name: "asc" },
  });

  const changes = cats
    .map((c) => ({
      ...c,
      nextTitle: TEMPLATE.title(c.name),
      nextDescription: TEMPLATE.description(c.name),
    }))
    .filter((c) => c.nextTitle !== c.seoTitle || c.nextDescription !== c.seoDescription);

  if (!changes.length) {
    console.log(`✓ all ${cats.length} categories already match the template`);
    return;
  }

  console.log(`${changes.length} of ${cats.length} categories differ from the template:\n`);
  for (const c of changes) {
    console.log(`  ${c.slug}`);
    console.log(`    title  - ${c.seoTitle ?? "(unset)"}`);
    console.log(`           + ${c.nextTitle}`);
    console.log(`    desc   - ${(c.seoDescription ?? "(unset)").slice(0, 90)}`);
    console.log(`           + ${c.nextDescription.slice(0, 90)}`);
    const w = [truncWarn("title", c.nextTitle, 60), truncWarn("description", c.nextDescription, 158)].filter(Boolean);
    w.forEach((x) => console.log(x));
    console.log();
  }

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply to commit.");
    return;
  }

  mkdirSync(".seo-backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `.seo-backups/${stamp}.json`;
  writeFileSync(backup, JSON.stringify(cats, null, 2));
  console.log(`backup written: ${backup}`);

  for (const c of changes) {
    await db.category.update({
      where: { id: c.id },
      data: { seoTitle: c.nextTitle, seoDescription: c.nextDescription },
    });
  }
  console.log(`✓ updated ${changes.length} categories`);
  console.log(`  roll back with: node scripts/category-seo.mjs --restore ${backup}`);
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
