import { qaTargetRefusal } from "../lib/catalog/qa-target";
import { consistentStagingPayments } from "../lib/deploy-env";

const argument = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const refusal = qaTargetRefusal(process.env.DATABASE_URL ?? "", argument("expect-ref"), process.env);
if (refusal || !consistentStagingPayments(process.env)) {
  console.error(refusal ?? "UAT requires consistent Razorpay TEST configuration");
  process.exit(1);
}
const warehouseId = argument("warehouse-id");
if (!warehouseId || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(warehouseId)) {
  console.error("Explicit --warehouse-id GUID required"); process.exit(1);
}
const { db } = await import("../lib/db");
const { prepareUatInventory } = await import("../lib/services/admin/uat-inventory");
const apply = process.argv.includes("--apply");
try {
  const variants = await db.productVariant.findMany({
    where: { isActive: true }, select: { sku: true, compareAtPaise: true }, orderBy: { sku: "asc" },
  });
  console.log(JSON.stringify({
    mode: apply ? "APPLY TEST STOCK" : "DRY RUN",
    activeSkus: variants.length,
    missingMrp: variants.filter(v => !v.compareAtPaise || v.compareAtPaise <= 0).map(v => v.sku),
    storedMrpNeedsProvenance: variants.filter(v => v.compareAtPaise && v.compareAtPaise > 0).map(v => v.sku),
    pricing: "UNCHANGED: stored MRP alone is not verified source evidence; use reviewed catalogue update",
  }, null, 2));
  const dryRun = new Error("dry-run rollback");
  await db.$transaction(async tx => {
    console.log(JSON.stringify(await prepareUatInventory(tx, warehouseId), null, 2));
    if (!apply) throw dryRun;
  }, { timeout: 60_000 }).catch(error => { if (error !== dryRun) throw error; });
  console.log(apply ? "Test stock committed" : "Dry run rolled back; no stock changes");
} catch {
  console.error("UAT setup refused or failed; transaction rolled back. Review target, reservations and warehouse allocation.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
