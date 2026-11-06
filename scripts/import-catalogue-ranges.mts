/**
 * Import the master catalogue's draft ranges (lib/services/admin/catalogue-range-import.ts).
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=.env.staging --import tsx \
 *     scripts/import-catalogue-ranges.mts --expect-ref=<supabase project ref> [--apply] [--artifact=<path>]
 *
 * Dry run unless --apply. Refuses to start unless DATABASE_URL belongs to --expect-ref and that ref
 * is not the production project (from .env and supabase/config.toml). Never prints the connection string.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const apply = process.argv.includes("--apply");
const artifact = arg("artifact") ?? "lib/catalog/master-2026-10-01-v2.1.json";
const expect = arg("expect-ref");

function ref(url: string | undefined): string {
  try {
    const u = new URL(url ?? "");
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return "localhost";
    return (decodeURIComponent(u.username) + " " + u.hostname).match(/[a-z]{20}/)?.[0] ?? "";
  } catch {
    return "";
  }
}
function refuse(why: string): never {
  process.stderr.write(`REFUSING: ${why}\n`);
  process.exit(1);
}

const target = ref(process.env.DATABASE_URL);
if (!expect) refuse("pass --expect-ref=<project ref> (or localhost) naming the database you mean to write");
if (!target || target !== expect) refuse(`DATABASE_URL does not belong to ${expect}`);
const prodRefs = new Set<string>();
if (existsSync(".env")) prodRefs.add(ref(readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)/m)?.[1]));
if (existsSync("supabase/config.toml")) prodRefs.add(readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? "");
prodRefs.delete("");
if (prodRefs.has(target)) refuse(`${target} is the production project`);

const bytes = readFileSync(artifact);
const sha = createHash("sha256").update(bytes).digest("hex");
const catalogue = JSON.parse(bytes.toString("utf8"));

const { planRangeImport, applyRangeImport } = await import("@/lib/services/admin/catalogue-range-import");
const { db } = await import("@/lib/db");
const summary = (p: Awaited<ReturnType<typeof planRangeImport>>) => ({
  categories: { create: p.categories.create.map((c) => c.slug), reuse: p.categories.reuse.length },
  brands: { create: p.brands.create.length, reuse: p.brands.reuse.length },
  products: { create: p.products.create.length, reuse: p.products.reuse.length },
  conflicts: p.conflicts,
});
try {
  console.log(JSON.stringify({ target, artifact, artifactSha256: sha, mode: apply ? "apply" : "dry-run" }));
  if (!apply) console.log(JSON.stringify(summary(await planRangeImport(catalogue)), null, 1));
  else {
    const res = await applyRangeImport(catalogue, sha);
    console.log(JSON.stringify({ plan: summary(res.plan), created: res.created }, null, 1));
  }
} finally {
  await db.$disconnect();
}
