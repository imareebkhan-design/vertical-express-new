/**
 * CLIENT UAT ONLY — test approvals at stored MRP (lib/services/admin/uat-approvals.ts).
 * Dry run unless --apply; --revert restores every product it changed.
 *
 *   VE_ALLOW_REMOTE_DB=1 DATABASE_URL=<staging> PAYMENT_GATEWAY=razorpay-test ALLOW_TEST_GATEWAY=1 \
 *     RAZORPAY_KEY_ID=rzp_test_… VE_DEPLOY_ENV=staging \
 *     NODE_PATH=./test-support/stubs npx tsx scripts/prepare-uat-approvals.mts \
 *     --expect-ref=gjhxhmcsuhxcmrvtkggz [--apply | --revert --apply]
 *
 * Refuses: production, any ref but staging (or a disposable local test DB with
 * --expect-ref=local-test), and anything but consistent Razorpay TEST settings.
 * Image hashes are taken from the repository's public/ file for "/…" URLs, or
 * fetched for absolute URLs.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { qaTargetRefusal } from "../lib/catalog/qa-target";
import { consistentStagingPayments } from "../lib/deploy-env";

const argument = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const refusal = qaTargetRefusal(process.env.DATABASE_URL ?? "", argument("expect-ref"), process.env);
if (refusal || !consistentStagingPayments(process.env)) {
  console.error(refusal ?? "UAT requires consistent Razorpay TEST configuration");
  process.exit(1);
}

async function sha256Of(url: string): Promise<string> {
  let bytes: Buffer;
  if (url.startsWith("/")) {
    const path = normalize(join(process.cwd(), "public", url));
    if (!path.startsWith(join(process.cwd(), "public"))) throw new Error(`Image path escapes public/: ${url}`);
    bytes = await readFile(path);
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Image fetch failed (${response.status}): ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  return createHash("sha256").update(bytes).digest("hex");
}

const { db } = await import("../lib/db");
const { prepareUatTestApprovals, revertUatTestApprovals } = await import("../lib/services/admin/uat-approvals");
const apply = process.argv.includes("--apply");
const revert = process.argv.includes("--revert");
const dryRun = new Error("dry-run rollback");
try {
  await db.$transaction(async tx => {
    const outcome = revert ? { reverted: await revertUatTestApprovals(tx) } : await prepareUatTestApprovals(tx, sha256Of);
    console.log(JSON.stringify({ mode: `${apply ? "APPLY" : "DRY RUN"} ${revert ? "REVERT" : "TEST APPROVALS"}`, ...outcome }, null, 2));
    if (!apply) throw dryRun;
  }, { timeout: 120_000 }).catch(error => { if (error !== dryRun) throw error; });
  console.log(apply ? "Committed" : "Dry run rolled back; nothing changed");
} catch (error) {
  console.error(`UAT approvals refused or failed; transaction rolled back. ${error instanceof Error ? error.message : ""}`);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
