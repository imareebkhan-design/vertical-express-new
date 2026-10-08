/**
 * Show a reviewed batch of draft products as catalog-only
 * (lib/services/admin/catalog-only-activation.ts).
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=.env.staging --import tsx \
 *     scripts/activate-catalog-only.mts --expect-ref=<supabase project ref> [--apply] [--batch=<path>]
 *
 * Dry run unless --apply. Refuses unless DATABASE_URL belongs to --expect-ref and that ref is
 * not production (the known ref, .env and supabase/config.toml). Never prints the connection string.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const PRODUCTION_REF = "gsfslnxvwmrgulzqypdp";
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const apply = process.argv.includes("--apply");
const batchPath = arg("batch") ?? "lib/catalog/catalog-only-batch-1.json";
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
const prodRefs = new Set<string>([PRODUCTION_REF]);
if (existsSync(".env")) prodRefs.add(ref(readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)/m)?.[1]));
if (existsSync("supabase/config.toml")) prodRefs.add(readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? "");
prodRefs.delete("");
if (prodRefs.has(target)) refuse(`${target} is the production project`);

const bytes = readFileSync(batchPath);
const sha = createHash("sha256").update(bytes).digest("hex");
const batch = JSON.parse(bytes.toString("utf8")) as { batch: string; products: { slug: string }[] };
const slugs = batch.products.map((p) => p.slug);

const { planCatalogOnly, applyCatalogOnly } = await import("@/lib/services/admin/catalog-only-activation");
const { db } = await import("@/lib/db");
const summary = (p: Awaited<ReturnType<typeof planCatalogOnly>>) => ({
  change: p.change.length,
  reuse: p.reuse.length,
  skip: p.skip,
  conflicts: p.conflicts,
  activateBrands: p.activateBrands.map((b) => b.slug),
  activateCategories: p.activateCategories.map((c) => c.slug),
});
try {
  console.log(JSON.stringify({ target, batch: batch.batch, batchPath, batchSha256: sha, slugs: slugs.length, mode: apply ? "apply" : "dry-run" }));
  const plan = apply
    ? await applyCatalogOnly(slugs, { batch: batch.batch, batchSha256: sha })
    : await planCatalogOnly(slugs);
  console.log(JSON.stringify(summary(plan), null, 1));
} finally {
  await db.$disconnect();
}
