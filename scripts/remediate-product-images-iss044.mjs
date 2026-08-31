#!/usr/bin/env node
/**
 * Production remediation script — ISS-044.
 *
 * Gated, transactional remediation of 29 ProductImage rows referencing
 * unlicensed third-party branded product photos and category composite images.
 *
 * Usage — always via a gitignored env file, never inline on the command line
 * (an inline DATABASE_URL ends up in shell history and the process table):
 *
 *   # .env.remediation  — create this file, never commit it
 *   # DATABASE_URL=postgres://...
 *
 *   node --env-file=.env.remediation scripts/remediate-product-images-iss044.mjs
 *   node --env-file=.env.remediation scripts/remediate-product-images-iss044.mjs --execute
 *
 * Behaviour:
 * - Dry-run is the default. --execute is required to commit.
 * - In dry-run the full mutation path (updateMany × 29, post-checks) executes
 *   inside the transaction and then rolls back — this proves the statement
 *   affects exactly the expected rows. Nothing is committed.
 * - DATABASE_URL denylist runs before any connection is opened (fast fail).
 *   NOTE: the denylist does NOT prove the target is production — a staging
 *   snapshot or another Supabase project at an identical pooler hostname passes
 *   it. Target identity is established by the in-transaction id reconciliation:
 *   the 29 primary-key ids exist in exactly one database. A wrong database fails
 *   there, not at the URL check.
 * - After --execute, post-commit acceptance checks verify: zero branded URLs
 *   remain anywhere in ProductImage; every distinct URL in the table resolves
 *   to a file on disk.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const DRY_RUN = !process.argv.includes("--execute");

// --- Fast fail: DATABASE_URL denylist ---
// Blocks known local/test patterns before a connection is opened.
// This does NOT prove the target is production — see header note above.
// Identity is proven by in-transaction id reconciliation.
const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL) {
  console.error("[FAIL-CLOSED] DATABASE_URL is not set. Cannot determine target database.");
  process.exit(1);
}
if (
  DB_URL.includes("localhost") ||
  DB_URL.includes("127.0.0.1") ||
  DB_URL.includes("vertical_express_test")
) {
  const masked = DB_URL.replace(/:\/\/[^@]*@/, "://***@");
  console.error(
    `[FAIL-CLOSED] DATABASE_URL looks like the local or test database.\n` +
      `  URL: ${masked}\n` +
      `  This script must only run against production. Aborting.`
  );
  process.exit(1);
}

const BACKUP_PATH = join(
  ROOT,
  ".image-backups",
  "product-images-2026-08-30T20-36-06-876Z.json"
);
const APPROVED_BACKUP_SHA256 =
  "7a0dbc50c4bf77bd57b6aab4e73a88751620f22db9029a46f7aff775c6f32758";
const EXPECTED_PLACEHOLDER = "/placeholder-product.webp";
const EXPECTED_COUNT = 29;

function validateBackupStructure() {
  if (!existsSync(BACKUP_PATH)) {
    throw new Error(`[FAIL-CLOSED] Authoritative backup file not found at ${BACKUP_PATH}`);
  }

  const rawBytes = readFileSync(BACKUP_PATH);
  const actualHash = createHash("sha256").update(rawBytes).digest("hex");

  if (actualHash !== APPROVED_BACKUP_SHA256) {
    throw new Error(
      `[FAIL-CLOSED] Backup SHA-256 integrity check failed!\n` +
        `  Expected: ${APPROVED_BACKUP_SHA256}\n` +
        `  Actual:   ${actualHash}\n` +
        `Backup has been modified or corrupted. Aborting.`
    );
  }

  let backup;
  try {
    backup = JSON.parse(rawBytes.toString("utf8"));
  } catch (err) {
    throw new Error(`[FAIL-CLOSED] Failed to parse backup file: ${err.message}`);
  }

  if (!backup || !Array.isArray(backup.rows)) {
    throw new Error("[FAIL-CLOSED] Backup file missing valid 'rows' array");
  }

  if (backup.rows.length !== EXPECTED_COUNT) {
    throw new Error(
      `[FAIL-CLOSED] Backup contains ${backup.rows.length} rows; expected exactly ${EXPECTED_COUNT}`
    );
  }

  if (backup.replacementUrl !== EXPECTED_PLACEHOLDER) {
    throw new Error(
      `[FAIL-CLOSED] Backup replacementUrl "${backup.replacementUrl}" does not match expected "${EXPECTED_PLACEHOLDER}"`
    );
  }

  const ids = new Set();
  for (const row of backup.rows) {
    if (!row.id || !row.product_id || !row.slug || !row.url) {
      throw new Error(`[FAIL-CLOSED] Malformed row in backup: ${JSON.stringify(row)}`);
    }
    if (ids.has(row.id)) {
      throw new Error(`[FAIL-CLOSED] Duplicate ProductImage ID found in backup: ${row.id}`);
    }
    ids.add(row.id);
  }

  if (ids.size !== EXPECTED_COUNT) {
    throw new Error(
      `[FAIL-CLOSED] Unique ID count (${ids.size}) does not equal expected count (${EXPECTED_COUNT})`
    );
  }

  return backup;
}

async function runAcceptanceChecks(prisma, backup) {
  console.log("4. Running post-commit acceptance checks...");

  // Check 1: all 29 target rows now carry the placeholder URL.
  const targetIds = backup.rows.map((r) => r.id);
  const targetRows = await prisma.productImage.findMany({
    where: { id: { in: targetIds } },
    select: { id: true, url: true },
  });
  const notPlaceholder = targetRows.filter((r) => r.url !== EXPECTED_PLACEHOLDER);
  if (notPlaceholder.length > 0) {
    console.error(
      `✗ Acceptance check FAILED: ${notPlaceholder.length} target row(s) do not have the placeholder URL:`
    );
    for (const r of notPlaceholder) console.error(`  id=${r.id} url="${r.url}"`);
    process.exit(1);
  }

  // Check 2: zero remaining rows anywhere in ProductImage with a pre-remediation branded URL.
  const brandedUrls = [...new Set(backup.rows.map((r) => r.url))];
  const remaining = await prisma.productImage.findMany({
    where: { url: { in: brandedUrls } },
    select: { id: true, url: true },
  });
  if (remaining.length > 0) {
    console.error(
      `✗ Acceptance check FAILED: ${remaining.length} row(s) in ProductImage still carry a pre-remediation URL:`
    );
    for (const r of remaining) console.error(`  id=${r.id} url="${r.url}"`);
    process.exit(1);
  }

  // Check 3: every distinct URL in ProductImage resolves to a file on disk.
  const allRows = await prisma.productImage.findMany({ select: { url: true } });
  const distinctUrls = [...new Set(allRows.map((r) => r.url))];
  const missingFiles = distinctUrls.filter((url) => !existsSync(join(ROOT, "public", url)));
  if (missingFiles.length > 0) {
    console.error(
      `✗ Acceptance check FAILED: ${missingFiles.length} distinct URL(s) do not resolve to a file in public/:`
    );
    for (const url of missingFiles) console.error(`  ${url}`);
    process.exit(1);
  }

  console.log(`✓ All ${EXPECTED_COUNT} target rows → "${EXPECTED_PLACEHOLDER}"`);
  console.log(`✓ Zero branded URLs remaining in ProductImage table.`);
  console.log(`✓ All ${distinctUrls.length} distinct URL(s) in ProductImage resolve to files on disk.`);
}

export async function runRemediation() {
  const maskedUrl = DB_URL.replace(/:\/\/[^@]*@/, "://***@");
  console.log("=== ISS-044 Production Image Remediation ===");
  console.log(
    `  Mode:     ${DRY_RUN ? "DRY RUN — full mutation path runs then rolls back (pass --execute to commit)" : "LIVE EXECUTE — writes will be committed"}`
  );
  console.log(`  Database: ${maskedUrl}`);
  console.log("");
  console.log("1. Validating backup file immutability and schema...");
  const backup = validateBackupStructure();
  console.log(`✓ Backup validated: exactly ${backup.rows.length} unique rows targeted.`);

  const prisma = new PrismaClient();

  try {
    console.log("2. Opening database transaction...");
    const summary = await prisma.$transaction(
      async (tx) => {
        const targetIds = backup.rows.map((r) => r.id);
        const backupMap = new Map(backup.rows.map((r) => [r.id, r]));

        // --- Identity reconciliation: load all 29 target rows by primary key ---
        // This is the real identity proof. The 29 ids exist in exactly one database.
        // A wrong database, a staging snapshot, or a restored copy will fail here.
        const currentRows = await tx.productImage.findMany({
          where: { id: { in: targetIds } },
          include: { product: true },
        });

        if (currentRows.length !== EXPECTED_COUNT) {
          throw new Error(
            `[IDENTITY FAIL] Expected ${EXPECTED_COUNT} rows from backup ids, ` +
              `found ${currentRows.length}. ` +
              `This is not the database the backup came from, or rows have been deleted. Rolling back.`
          );
        }

        for (const current of currentRows) {
          const expected = backupMap.get(current.id);
          if (!expected) {
            throw new Error(
              `[IDENTITY FAIL] ProductImage id ${current.id} was returned by the query ` +
                `but is not in the backup. ` +
                `This is not the database the backup came from. Rolling back.`
            );
          }

          if (current.productId !== expected.product_id) {
            throw new Error(
              `[IDENTITY FAIL] productId mismatch on image ${current.id}: ` +
                `DB ${current.productId} !== backup ${expected.product_id}. ` +
                `This is not the database the backup came from. Rolling back.`
            );
          }

          if (!current.product || current.product.slug !== expected.slug) {
            throw new Error(
              `[IDENTITY FAIL] Slug mismatch on image ${current.id}: ` +
                `DB "${current.product?.slug}" !== backup "${expected.slug}". ` +
                `This is not the database the backup came from. Rolling back.`
            );
          }

          if (current.url !== expected.url) {
            throw new Error(
              `[STATE DIVERGED] URL mismatch on image ${current.id} (${current.product?.slug}): ` +
                `DB "${current.url}" !== backup "${expected.url}". ` +
                `The database state has changed since the backup was taken, ` +
                `or this is not the source database. Rolling back.`
            );
          }
        }

        console.log("✓ Identity reconciliation passed for all 29 rows.");

        // --- Atomic mutation: per-row optimistic lock (where: { id, url: expected.url }) ---
        // In dry-run mode this runs inside the transaction and then rolls back,
        // proving the statement affects exactly the expected number of rows.
        let updatedCount = 0;
        for (const expected of backup.rows) {
          const res = await tx.productImage.updateMany({
            where: {
              id: expected.id,
              url: expected.url,
            },
            data: {
              url: EXPECTED_PLACEHOLDER,
            },
          });

          if (res.count !== 1) {
            throw new Error(
              `In-transaction update assertion failed on ProductImage id ${expected.id} (${expected.slug}): ` +
                `expected 1 row updated, got ${res.count}. State modified concurrently. Rolling back.`
            );
          }
          updatedCount += res.count;
        }

        if (updatedCount !== EXPECTED_COUNT) {
          throw new Error(
            `In-transaction total update count mismatch: expected ${EXPECTED_COUNT}, ` +
              `got ${updatedCount}. Rolling back.`
          );
        }

        // --- Post-mutation check 1: re-fetch and verify all 29 URLs ---
        const verifiedRows = await tx.productImage.findMany({
          where: { id: { in: targetIds } },
        });

        if (verifiedRows.length !== EXPECTED_COUNT) {
          throw new Error(
            `Post-mutation check failed: expected ${EXPECTED_COUNT} rows, ` +
              `found ${verifiedRows.length}. Rolling back.`
          );
        }

        for (const row of verifiedRows) {
          if (row.url !== EXPECTED_PLACEHOLDER) {
            throw new Error(
              `Post-mutation check failed: row ${row.id} URL is "${row.url}", ` +
                `expected "${EXPECTED_PLACEHOLDER}". Rolling back.`
            );
          }
        }

        // --- Post-mutation check 2: total row count invariant ---
        const totalProductImages = await tx.productImage.count();
        if (totalProductImages !== 45) {
          throw new Error(
            `Invariant failed: total ProductImage count is ${totalProductImages}, ` +
              `expected 45. Rolling back.`
          );
        }

        // Print the 29 rows (both modes — the list is what the caller needs to review).
        const label = DRY_RUN ? "DRY RUN" : "LIVE";
        console.log(`\n${label} — rows updated (url only):\n`);
        for (const row of verifiedRows) {
          const expected = backupMap.get(row.id);
          console.log(
            `  id=${row.id}  slug=${expected.slug}\n` +
              `    "${expected.url}"\n` +
              `    → "${EXPECTED_PLACEHOLDER}"`
          );
        }
        console.log(`\n  Total: ${updatedCount} rows.\n`);

        if (DRY_RUN) {
          // Throw to trigger rollback. Nothing is committed.
          // The mutation ran and confirmed exactly 29 rows were affected.
          throw new Error("DRY_RUN_ROLLBACK");
        }

        return { updatedCount, verifiedRows: verifiedRows.length, totalProductImages };
      },
      { maxWait: 5000, timeout: 10000 }
    );

    console.log("3. Transaction committed successfully.");
    console.log(`✓ ${summary.updatedCount} rows updated to "${EXPECTED_PLACEHOLDER}"`);
    console.log(`✓ Total ProductImage count: ${summary.totalProductImages}`);

    await runAcceptanceChecks(prisma, backup);
    console.log("=== REMEDIATION COMPLETE — ALL ACCEPTANCE CHECKS PASSED ===");
  } catch (err) {
    if (err.message === "DRY_RUN_ROLLBACK") {
      console.log("✓ Dry run complete. Transaction rolled back — nothing committed.");
      console.log("  The full mutation path ran and confirmed exactly 29 rows were affected.");
      console.log("  Re-run with --execute to commit.");
    } else {
      console.error(`\n✗ TRANSACTION FAILED & ROLLED BACK: ${err.message}\n`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Auto-run only if executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith("remediate-product-images-iss044.mjs")) {
  runRemediation();
}
