/**
 * Plan and check the move of approved product photos to a production bucket
 * (handover 03 §B, blocker E-6). Read-only: it reads the database and fetches
 * objects over HTTPS; it never copies, uploads or writes a row.
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=.env.staging --import tsx \
 *     scripts/image-rehome-check.mts --expect-ref=<supabase project ref> \
 *       --source-base=https://storage.googleapis.com/ve-staging-product-images \
 *       --dest-base=https://storage.googleapis.com/<production bucket> \
 *       [--out=<manifest.json>] [--check=source|dest]
 *
 * Selects photos with `approvedImageWhere()` under PRODUCTION rules (attested licence
 * required), so the manifest is exactly what a production catalogue may show.
 * --check=source hashes every source object against its recorded sha256 (rehearsal);
 * --check=dest does the same at the destination after the owner-approved copy.
 * Exit code 1 if any approved photo cannot be moved safely or any hash differs.
 */
import { writeFileSync } from "node:fs";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
function refuse(why: string): never {
  process.stderr.write(`REFUSING: ${why}\n`);
  process.exit(1);
}
function ref(url: string | undefined): string {
  try {
    const u = new URL(url ?? "");
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return "localhost";
    return (decodeURIComponent(u.username) + " " + u.hostname).match(/[a-z]{20}/)?.[0] ?? "";
  } catch {
    return "";
  }
}

const expect = arg("expect-ref");
const sourceBase = arg("source-base");
const destBase = arg("dest-base");
const check = arg("check");
if (!expect) refuse("pass --expect-ref=<project ref> (or localhost) naming the database to read");
if (ref(process.env.DATABASE_URL) !== expect) refuse(`DATABASE_URL does not belong to ${expect}`);
if (!sourceBase || !destBase) refuse("pass --source-base and --dest-base (https URLs of the two buckets)");
if (check && check !== "source" && check !== "dest") refuse("--check must be source or dest");

/* Production rules for the selection only; this process serves nothing. */
process.env.VE_DEPLOY_ENV = "production";
const { db } = await import("@/lib/db");
const { approvedImageWhere } = await import("@/lib/catalog-policy");
const { rehomePlan, matchesSha256 } = await import("@/lib/catalog/image-rehome");

const rows = await db.productImage.findMany({ where: approvedImageWhere(), select: { id: true, url: true, sha256: true } });
const relaxedCount = await db.productImage.count({
  where: { ...approvedImageWhere(), licence: undefined },
});
const plan = rehomePlan(rows, { sourceBase, destBase });

const summary = {
  approvedForProduction: rows.length,
  approvedOnStagingOnly: relaxedCount - rows.length,
  toCopy: plan.copy.length,
  servedByApp: plan.local.length,
  problems: plan.problems.length,
};
console.log(JSON.stringify(summary, null, 2));
for (const p of plan.problems) console.log(`PROBLEM ${p.id} ${p.reason}: ${p.url}`);
const out = arg("out");
if (out) writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), sourceBase, destBase, ...plan }, null, 2));

let mismatches = 0;
if (check) {
  for (const item of plan.copy) {
    const url = check === "source" ? item.from : item.to;
    const res = await fetch(url).catch(() => null);
    const ok = res?.ok ? matchesSha256(new Uint8Array(await res.arrayBuffer()), item.sha256) : false;
    if (!ok) {
      mismatches += 1;
      console.log(`MISMATCH ${item.id} ${res ? `HTTP ${res.status}` : "unreachable"}: ${url}`);
    }
  }
  console.log(`${check} check: ${plan.copy.length - mismatches}/${plan.copy.length} objects match their sha256`);
}
await db.$disconnect();
process.exit(plan.problems.length || mismatches ? 1 : 0);
