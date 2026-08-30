#!/usr/bin/env node
/**
 * Production remediation script — ISS-044.
 *
 * Gated, transactional remediation of 29 ProductImage rows referencing
 * unlicensed third-party branded product photos and category composite images.
 *
 * Requirements:
 * - Operates under a strict interactive transaction with pessimistic/optimistic checks.
 * - Reconciles before-state against .image-backups/product-images-2026-08-30T20-36-06-876Z.json.
 * - Asserts row count, ID, productId, slug, and current URL in-transaction.
 * - Updates ONLY ProductImage.url to /placeholder-product.webp using per-row (id + url) predicates.
 * - Leaves ProductImage.alt and all other tables/columns strictly untouched.
 * - Aborts and rolls back on any precondition or assertion mismatch.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
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

  // 1 & 2. Read raw bytes and calculate cryptographic SHA-256
  const rawBytes = readFileSync(BACKUP_PATH);
  const actualHash = createHash("sha256").update(rawBytes).digest("hex");

  // 3 & 4. Verify hash against approved checksum
  if (actualHash !== APPROVED_BACKUP_SHA256) {
    throw new Error(
      `[FAIL-CLOSED] Backup SHA-256 integrity check failed!\n` +
        `  Expected: ${APPROVED_BACKUP_SHA256}\n` +
        `  Actual:   ${actualHash}\n` +
        `Backup has been modified or corrupted. Aborting.`
    );
  }

  // 5. Parse and validate JSON structure only after hash verification passes
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

export async function runRemediation() {
  console.log("=== ISS-044 Production Image Remediation ===");
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

        // --- In-transaction precondition check 1: Load all 29 target rows ---
        const currentRows = await tx.productImage.findMany({
          where: { id: { in: targetIds } },
          include: { product: true },
        });

        if (currentRows.length !== EXPECTED_COUNT) {
          throw new Error(
            `In-transaction precondition failed: expected ${EXPECTED_COUNT} rows in DB, found ${currentRows.length}. Rolling back.`
          );
        }

        // --- In-transaction precondition check 2: Validate identity, product, slug, and URL ---
        for (const current of currentRows) {
          const expected = backupMap.get(current.id);
          if (!expected) {
            throw new Error(
              `In-transaction check failed: unexpected ProductImage ID ${current.id}. Rolling back.`
            );
          }

          // 1. ProductImage.id === backup.id
          if (current.id !== expected.id) {
            throw new Error(
              `In-transaction ID mismatch: DB ${current.id} !== backup ${expected.id}. Rolling back.`
            );
          }

          // 2. ProductImage.productId === backup.product_id
          if (current.productId !== expected.product_id) {
            throw new Error(
              `In-transaction productId mismatch on ${current.id}: DB ${current.productId} !== backup ${expected.product_id}. Rolling back.`
            );
          }

          // 3. associated product.slug === backup.slug
          if (!current.product || current.product.slug !== expected.slug) {
            throw new Error(
              `In-transaction slug mismatch on ${current.id}: DB "${current.product?.slug}" !== backup "${expected.slug}". Rolling back.`
            );
          }

          // 4. ProductImage.url === backup.url
          if (current.url !== expected.url) {
            throw new Error(
              `In-transaction URL mismatch on ${current.id} (${current.product.slug}): ` +
                `DB "${current.url}" !== backup "${expected.url}". Rolling back.`
            );
          }
        }

        console.log("✓ In-transaction pre-validation passed for all 29 rows.");

        // --- Atomic mutation: Per-row optimistic lock (where: { id, url: expected.url }) ---
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
              `In-transaction atomic update assertion failed on ProductImage ID ${expected.id} (${expected.slug}): ` +
                `expected 1 row updated, got ${res.count}. State modified concurrently. Rolling back.`
            );
          }
          updatedCount += res.count;
        }

        if (updatedCount !== EXPECTED_COUNT) {
          throw new Error(
            `In-transaction total update count mismatch: expected ${EXPECTED_COUNT}, got ${updatedCount}. Rolling back.`
          );
        }

        // --- In-transaction post-check 1: Re-fetch and verify all 29 URLs ---
        const verifiedRows = await tx.productImage.findMany({
          where: { id: { in: targetIds } },
        });

        if (verifiedRows.length !== EXPECTED_COUNT) {
          throw new Error(
            `In-transaction post-check failed: expected ${EXPECTED_COUNT} rows, found ${verifiedRows.length}. Rolling back.`
          );
        }

        for (const row of verifiedRows) {
          if (row.url !== EXPECTED_PLACEHOLDER) {
            throw new Error(
              `In-transaction post-check failed: row ${row.id} URL is "${row.url}", expected "${EXPECTED_PLACEHOLDER}". Rolling back.`
            );
          }
        }

        // --- In-transaction post-check 2: System invariant ---
        const totalProductImages = await tx.productImage.count();
        if (totalProductImages !== 45) {
          throw new Error(
            `In-transaction invariant failed: total ProductImage count is ${totalProductImages}, expected 45. Rolling back.`
          );
        }

        return {
          updatedCount,
          verifiedRows: verifiedRows.length,
          totalProductImages,
        };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );

    console.log("3. Transaction committed successfully.");
    console.log(`✓ Exactly ${summary.updatedCount} rows updated to ${EXPECTED_PLACEHOLDER}`);
    console.log(`✓ Total ProductImage table count invariant: ${summary.totalProductImages}`);
    console.log("=== REMEDIATION COMPLETE ===");
  } catch (err) {
    console.error(`\n✗ TRANSACTION FAILED & ROLLED BACK: ${err.message}\n`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Auto-run only if executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith("remediate-product-images-iss044.mjs")) {
  runRemediation();
}
