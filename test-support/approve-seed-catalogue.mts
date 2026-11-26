/**
 * CI/test-only: records explicit approvals on the SEEDED synthetic catalogue of a
 * disposable local test database, so tests that read the seed keep working under
 * the explicit-approval policy (lib/catalog-policy.ts). Refuses anything but a
 * local database flagged VE_TEST_DATABASE=1. Idempotent.
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --env-file-if-exists=.env.test \
 *     --import ./test-support/db-guard.mjs --import tsx test-support/approve-seed-catalogue.mts
 */
import { db } from "@/lib/db";
import { approveSyntheticProductForSale } from "./catalogue-fixtures";

const products = await db.product.findMany({ where: { status: { in: ["published", "catalog_only"] } }, select: { id: true } });
for (const p of products) await approveSyntheticProductForSale(p.id, { allowUntaxed: true });
console.log(`approved ${products.length} seeded products for tests`);
await db.$disconnect();
