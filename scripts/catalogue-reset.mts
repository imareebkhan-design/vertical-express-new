/**
 * One-time reset of the previous catalogue (lib/services/admin/catalogue-reset.ts).
 *
 *   Read-only manifest — writes nothing to the database:
 *     NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=<env> --import tsx \
 *       scripts/catalogue-reset.mts plan --cutoff=2026-11-17T00:00:00Z --out=<dir outside the repo> [--archive-qa-fixtures]
 *
 *   --archive-qa-fixtures (staging): archive the qa-staging-* test products too, keeping their
 *   names, so customers see only launch products. Recorded in the manifest; apply uses it.
 *
 *   Apply exactly the reviewed manifest:
 *     … scripts/catalogue-reset.mts apply --manifest=<the .json plan wrote> --expect-ref=<ref|localhost> \
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
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, isAbsolute, join, sep } from "node:path";
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
  if (!expect) refuse("pass --expect-ref=SUPABASE_PROJECT_REF (or localhost) naming the database you mean to change");
  if (t.ref !== expect) refuse(`DATABASE_URL belongs to ${t.ref}, not ${expect}`);
  if (t.production && !flag("production")) refuse(`${t.ref} is the production project. Add --production only once the owner has approved this manifest for production.`);
}

const REPO = realpathSync(process.cwd());

/**
 * A path the script may write or read: absolute, outside the repository (a
 * manifest or recovery file must never be committed), and not a symlink.
 */
function safePath(p: string | undefined, what: string): string {
  if (!p) refuse(`pass ${what}`);
  if (!isAbsolute(p)) refuse(`${what} must be an absolute path`);
  let probe = p;
  while (!existsSync(probe)) probe = dirname(probe);
  const real = realpathSync(probe);
  if (real === REPO || real.startsWith(REPO + sep)) refuse(`${what} must be outside the repository`);
  if (existsSync(p) && lstatSync(p).isSymbolicLink()) refuse(`${what} is a symbolic link`);
  return p;
}

/** Read a JSON file that must be a regular file at a safe path. */
function readJson(p: string | undefined, what: string): Record<string, unknown> {
  const path = safePath(p, what);
  if (!existsSync(path) || !lstatSync(path).isFile()) refuse(`${what} is not a file`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    refuse(`${what} is not valid JSON`);
  }
}

function cutoff(): Date {
  const raw = arg("cutoff");
  if (!raw) refuse("pass --cutoff=ISO_TIME. Products created before it are the previous catalogue.");
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
  safePath(path, "--recovery-out");
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
  const visible = p.remainingVisible.length === 0
    ? "_None. After the reset customers see no product until new ones are published._\n"
    : ["| Slug | Status | Title | Why it stays |", "|---|---|---|---|",
       ...p.remainingVisible.map((v) => `| ${v.slug} | ${v.status} | ${v.title} | ${v.why} |`)].join("\n") + "\n";
  return `# Catalogue reset manifest

Read-only. Nothing was written to the database to produce this.

| | |
|---|---|
| Environment | ${env.ref}${env.production ? " (PRODUCTION)" : ""}, database \`${env.database}\` |
| Database identity | \`${String((m.database as { id: string }).id)}\` |
| Produced | ${String(m.generatedAt)} from commit ${String(m.commit)} |
| Cutoff | products created before ${p.cutoff} |
| QA fixtures | ${p.options.archiveQaFixtures ? "archived, names kept (--archive-qa-fixtures)" : "left as they are"} |
| Products created after the cutoff (untouched) | ${p.createdAfterCutoff} |
| **Digest to approve** | \`${p.digest}\` |

## Summary

| Action | Products | Meaning |
|---|---|---|
| retire | ${p.summary.retire} | Archived; web address and item codes get \`--${p.tag}\` so the real product can be listed again (QA fixtures keep their names). History keeps pointing at it. |
| remove | ${p.summary.remove} | Deleted with its packs, photo rows, zero-stock records and cart lines. Nothing but the audit log refers to it. |
| exclude | ${p.summary.exclude} | Left exactly as it is, for the reason given. |

How the products were identified:

| Source | Products |
|---|---|
${bySource}

## Still visible to customers after the reset

${visible}
## Never changed — checked byte for byte before commit (the audit log may only grow)

${Object.entries(p.preserved).map(([t, n]) => `- ${t}: ${n} rows${t === "audit_logs" ? " (may only grow)" : `, content ${String(p.preservedContent[t] ?? "").slice(0, 12)}…`}`).join("\n")}

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
    const out = safePath(arg("out"), "--out (an absolute directory outside the repository)");
    const plan = await svc.planCatalogueReset(cutoff(), seedSlugs(), db, { archiveQaFixtures: flag("archive-qa-fixtures") });
    const database = await svc.databaseIdentity(db);
    const manifest = { kind: "catalogue-reset-manifest", version: 2, generatedAt: new Date().toISOString(), commit, environment: t, database, recreationRisks: RECREATION_RISKS, plan };
    mkdirSync(out, { recursive: true });
    const stem = `catalogue-reset-manifest-${t.ref}-${plan.digest.slice(0, 12)}`;
    writeFileSync(join(out, `${stem}.json`), JSON.stringify(manifest, null, 1));
    writeFileSync(join(out, `${stem}.md`), manifestMarkdown(manifest));
    console.log(JSON.stringify({ environment: t, database: database.id, cutoff: plan.cutoff, digest: plan.digest, summary: plan.summary, createdAfterCutoff: plan.createdAfterCutoff, stillVisible: plan.remainingVisible.length, files: [`${stem}.json`, `${stem}.md`] }, null, 1));
  } else if (mode === "apply") {
    guardWrite(t);
    const manifest = readJson(arg("manifest"), "--manifest (the .json file plan wrote)");
    const plan = manifest.plan as { digest?: string; cutoff?: string; options?: { archiveQaFixtures?: boolean } } | undefined;
    const approvedDb = (manifest.database as { id?: string } | undefined)?.id;
    if (manifest.kind !== "catalogue-reset-manifest" || manifest.version !== 2 || !plan?.digest || !plan.cutoff || !approvedDb) {
      refuse("--manifest is not a catalogue reset manifest from this version of the script");
    }
    const approve = arg("approve");
    if (!approve || approve !== plan.digest) refuse("--approve must be the digest printed in that manifest, typed out by the person approving it");
    const recoveryOut = safePath(arg("recovery-out"), "--recovery-out (an absolute file outside the repository)");
    if (existsSync(recoveryOut)) refuse(`${recoveryOut} already exists; recovery files are never overwritten`);
    const res = await svc.applyCatalogueReset({
      cutoff: new Date(plan.cutoff),
      seedSlugs: seedSlugs(),
      approvedDigest: approve,
      approvedDatabaseId: approvedDb,
      options: { archiveQaFixtures: plan.options?.archiveQaFixtures === true },
      onRecovery: (r) => durableWrite(recoveryOut, JSON.stringify({ kind: "catalogue-reset-recovery", environment: t, commit, ...r })),
    });
    console.log(JSON.stringify({ environment: t, applied: res, recovery: recoveryOut }, null, 1));
  } else if (mode === "restore") {
    guardWrite(t);
    const rec = readJson(arg("recovery"), "--recovery (the file apply wrote)");
    const removed = rec.removed as Record<string, unknown> | undefined;
    if (rec.kind !== "catalogue-reset-recovery" || typeof rec.digest !== "string" || !/^[a-f0-9]{64}$/.test(rec.digest)
      || !Array.isArray(rec.retired) || !removed || !Array.isArray(removed.products)) {
      refuse("--recovery is not a catalogue reset recovery file");
    }
    const here = await svc.databaseIdentity(db);
    if ((rec.database as { id?: string } | undefined)?.id !== here.id) {
      refuse(`that recovery file belongs to ${(rec.database as { id?: string } | undefined)?.id ?? "an unknown database"}, not ${here.id}`);
    }
    console.log(JSON.stringify({ environment: t, restored: await svc.restoreCatalogueReset(rec as unknown as import("@/lib/services/admin/catalogue-reset").ResetRecovery) }, null, 1));
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
