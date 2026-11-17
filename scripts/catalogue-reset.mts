/**
 * One-time reset of the previous catalogue (lib/services/admin/catalogue-reset.ts).
 *
 *   Read-only manifest — writes nothing to the database:
 *     NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=<env> --import tsx \
 *       scripts/catalogue-reset.mts plan --cutoff=2026-11-17T00:00:00Z --out=<dir outside the repo>
 *
 *   Apply exactly the reviewed manifest:
 *     … scripts/catalogue-reset.mts apply --cutoff=<same> --expect-ref=<ref|localhost> \
 *       --approve=<digest from the manifest> --recovery-out=<file outside the repo> [--production]
 *
 *   Undo it:
 *     … scripts/catalogue-reset.mts restore --recovery=<file> --expect-ref=<ref|localhost> [--production]
 *
 *   Fingerprint the catalogue tables (to compare before / after a restore):
 *     … scripts/catalogue-reset.mts fingerprint
 *
 * Refuses unless DATABASE_URL belongs to --expect-ref. Refuses the production
 * project unless --production is also given. Never prints the connection string.
 * There is deliberately no dashboard button for any of this.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { PRODUCTION_DB_REFS, supabaseRef, isLocalHost } from "./prisma-db-guard.mjs";

const [mode] = process.argv.slice(2);
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string) => process.argv.includes(`--${name}`);

function refuse(why: string): never {
  process.stderr.write(`REFUSING: ${why}\n`);
  process.exit(1);
}

function target(): { ref: string; database: string; production: boolean } {
  let u: URL;
  try {
    u = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    refuse("DATABASE_URL is not set or not a URL");
  }
  const ref = isLocalHost(u.hostname) ? "localhost" : supabaseRef(u.toString()) ?? "unknown-remote";
  return { ref, database: decodeURIComponent(u.pathname.slice(1)), production: PRODUCTION_DB_REFS.has(ref) };
}

function guardWrite(t: ReturnType<typeof target>) {
  const expect = arg("expect-ref");
  if (!expect) refuse("pass --expect-ref=<supabase project ref> (or localhost) naming the database you mean to change");
  if (t.ref !== expect) refuse(`DATABASE_URL belongs to ${t.ref}, not ${expect}`);
  if (t.production && !flag("production")) refuse(`${t.ref} is the production project. Add --production only once the owner has approved this manifest for production.`);
}

function cutoff(): Date {
  const raw = arg("cutoff");
  if (!raw) refuse("pass --cutoff=<ISO time>. Products created before it are the previous catalogue.");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) refuse(`--cutoff=${raw} is not a time`);
  return d;
}

/** The demo products' web addresses, read from the seed file rather than by running it. */
function seedSlugs(): Set<string> {
  const src = readFileSync("prisma/seed.ts", "utf8");
  const block = src.slice(src.indexOf("const PRODUCTS"), src.indexOf("];", src.indexOf("const PRODUCTS")));
  return new Set([...block.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]));
}

function durableWrite(path: string, text: string) {
  const fd = openSync(path, "wx"); // never overwrite an earlier recovery file
  writeSync(fd, text);
  fsyncSync(fd);
  closeSync(fd);
}

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
})();

/** Every job that writes products, and whether it can bring the old catalogue back. */
const RECREATION_RISKS = [
  { job: "prisma/seed.ts (npm run db:seed, db:demo:setup)", recreates: "the 45 demo products, by web address", control: "Refuses to seed products while a reset is in force. The Prisma guard already refuses a remote database without VE_ALLOW_REMOTE_DB=1. CI seeds only its own throwaway database." },
  { job: "scripts/import-catalogue-ranges.mts --apply", recreates: "every master-catalogue range product whose web address is free", control: "Refuses while a reset is in force. Already refuses the production project." },
  { job: "npm run qa:fixture / qa:catalogue (staging)", recreates: "qa-staging-* test products only", control: "Excluded from the reset; never shown on production (QA_FIXTURE_PREFIX)." },
  { job: "scripts/activate-catalog-only.mts", recreates: "nothing — it changes draft products to catalogue-only; a removed product no longer exists and a retired one is archived", control: "None needed." },
  { job: "Deploys (npm run deploy:staging, App Hosting builds)", recreates: "nothing — a deploy runs next build only; no seed, no import, no migration", control: "None needed." },
];

function manifestMarkdown(m: Record<string, unknown> & { plan: Awaited<ReturnType<typeof import("@/lib/services/admin/catalogue-reset").planCatalogueReset>> }): string {
  const p = m.plan;
  const env = m.environment as { ref: string; database: string; production: boolean };
  const refs = (e: (typeof p.entries)[number]) => {
    const r = e.references;
    return [
      r.orderLines && `orders ${r.orderLines}${r.openOrderLines ? ` (${r.openOrderLines} open)` : ""}`,
      r.refundsOnTheseOrders && `refunds ${r.refundsOnTheseOrders}`,
      r.returnLines && `returns ${r.returnLines}`,
      r.stockMovements && `stock moves ${r.stockMovements}`,
      r.unitsOnHand && `on hand ${r.unitsOnHand}`,
      r.enquiries && `enquiries ${r.enquiries}`,
      (r.identityConfirmed || r.approvedPhotos) && "approval",
      r.sharedPhotoWith.length && `shared photo: ${r.sharedPhotoWith.join(" ")}`,
      r.cartLines && `carts ${r.cartLines}`,
    ].filter(Boolean).join("; ") || "—";
  };
  const table = (action: string) => {
    const rows = p.entries.filter((e) => e.action === action);
    if (rows.length === 0) return "_None._\n";
    return ["| Slug | Status | SKUs | Source | References | " + (action === "retire" ? "Becomes |" : "Why |"), "|---|---|---|---|---|---|",
      ...rows.map((e) => `| ${e.slug} | ${e.status} | ${e.skus.join(" ")} | ${e.source} | ${refs(e)} | ${action === "retire" ? e.retiredSlug : e.reason} |`)].join("\n") + "\n";
  };
  const bySource = Object.entries(p.entries.reduce<Record<string, number>>((a, e) => ((a[e.source] = (a[e.source] ?? 0) + 1), a), {}))
    .map(([s, n]) => `| ${s} | ${n} |`).join("\n");
  return `# Catalogue reset manifest

Read-only. Nothing was written to the database to produce this.

| | |
|---|---|
| Environment | ${env.ref}${env.production ? " (PRODUCTION)" : ""}, database \`${env.database}\` |
| Produced | ${m.generatedAt} from commit ${m.commit} |
| Cutoff | products created before ${p.cutoff} |
| Products created after the cutoff (untouched) | ${p.createdAfterCutoff} |
| **Digest to approve** | \`${p.digest}\` |

## Summary

| Action | Products | Meaning |
|---|---|---|
| retire | ${p.summary.retire} | Archived; web address and item codes get \`--${p.tag}\` so the real product can be listed again. History keeps pointing at it. |
| remove | ${p.summary.remove} | Deleted with its packs, photo rows, zero-stock records and cart lines. Nothing but the audit log refers to it. |
| exclude | ${p.summary.exclude} | Left exactly as it is, for the reason given. |

How the products were identified:

| Source | Products |
|---|---|
${bySource}

## Never changed — counted before and after, inside the transaction

${Object.entries(p.preserved).map(([t, n]) => `- ${t}: ${n}${t === "audit_logs" ? " (may only grow)" : ""}`).join("\n")}

## Could anything bring them back?

| Job | Would recreate | Control |
|---|---|---|
${RECREATION_RISKS.map((r) => `| ${r.job} | ${r.recreates} | ${r.control} |`).join("\n")}

## Excluded, and why

${table("exclude")}
## Retire

${table("retire")}
## Remove

${table("remove")}`;
}

const { db } = await import("@/lib/db");
const svc = await import("@/lib/services/admin/catalogue-reset");
const t = target();

try {
  if (mode === "plan") {
    const out = arg("out");
    if (!out) refuse("pass --out=<directory outside the repository>");
    const plan = await svc.planCatalogueReset(cutoff(), seedSlugs());
    const manifest = { kind: "catalogue-reset-manifest", version: 1, generatedAt: new Date().toISOString(), commit, environment: t, recreationRisks: RECREATION_RISKS, plan };
    mkdirSync(out, { recursive: true });
    const stem = `catalogue-reset-manifest-${t.ref}-${plan.digest.slice(0, 12)}`;
    writeFileSync(join(out, `${stem}.json`), JSON.stringify(manifest, null, 1));
    writeFileSync(join(out, `${stem}.md`), manifestMarkdown(manifest));
    console.log(JSON.stringify({ environment: t, cutoff: plan.cutoff, digest: plan.digest, summary: plan.summary, createdAfterCutoff: plan.createdAfterCutoff, files: [`${stem}.json`, `${stem}.md`] }, null, 1));
  } else if (mode === "apply") {
    guardWrite(t);
    const approve = arg("approve");
    const recoveryOut = arg("recovery-out");
    if (!approve || !/^[a-f0-9]{64}$/.test(approve)) refuse("pass --approve=<the 64-character digest printed in the manifest>");
    if (!recoveryOut) refuse("pass --recovery-out=<file outside the repository>");
    if (existsSync(recoveryOut)) refuse(`${recoveryOut} already exists; recovery files are never overwritten`);
    const res = await svc.applyCatalogueReset({
      cutoff: cutoff(),
      seedSlugs: seedSlugs(),
      approvedDigest: approve,
      onRecovery: (r) => durableWrite(recoveryOut, JSON.stringify({ kind: "catalogue-reset-recovery", environment: t, commit, ...r })),
    });
    console.log(JSON.stringify({ environment: t, applied: res, recovery: recoveryOut }, null, 1));
  } else if (mode === "restore") {
    guardWrite(t);
    const file = arg("recovery");
    if (!file) refuse("pass --recovery=<the file apply wrote>");
    const rec = JSON.parse(readFileSync(file, "utf8"));
    if (rec.kind !== "catalogue-reset-recovery") refuse(`${file} is not a catalogue reset recovery file`);
    if (rec.environment?.ref !== t.ref) refuse(`${file} was written for ${rec.environment?.ref}, not ${t.ref}`);
    console.log(JSON.stringify({ environment: t, restored: await svc.restoreCatalogueReset(rec) }, null, 1));
  } else if (mode === "fingerprint") {
    console.log(JSON.stringify({ environment: t, inForce: await svc.catalogueResetInForce(), tables: await svc.catalogueFingerprint() }, null, 1));
  } else {
    refuse("mode must be plan, apply, restore or fingerprint");
  }
} catch (e) {
  if (e instanceof svc.ResetRefused) refuse(e.message);
  throw e;
} finally {
  await db.$disconnect();
}
