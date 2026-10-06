/**
 * Attach prepared product photographs from a plan file (lib/services/admin/product-image-import.ts).
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --env-file=.env.staging --import tsx \
 *     scripts/import-product-images.mts --expect-ref=<supabase project ref> --plan=<plan.json> \
 *     --image-base=https://storage.googleapis.com/<bucket> [--apply]
 *
 * Dry run unless --apply. Refuses unless DATABASE_URL belongs to --expect-ref and that ref is not the
 * production project (from .env and supabase/config.toml). The images must already be uploaded under
 * --image-base: this script writes database rows, it uploads nothing. Never prints the connection string.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const apply = process.argv.includes("--apply");
const expect = arg("expect-ref");
const planPath = arg("plan");
const imageBase = arg("image-base");

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
if (!planPath) refuse("pass --plan=<plan.json>");
if (!imageBase) refuse("pass --image-base=<https URL of the image host>");

const bytes = readFileSync(planPath);
const planSha256 = createHash("sha256").update(bytes).digest("hex");
const items = JSON.parse(bytes.toString("utf8")).items;

const { planImageImport, applyImageImport } = await import("@/lib/services/admin/product-image-import");
const { db } = await import("@/lib/db");
const summary = (p: Awaited<ReturnType<typeof planImageImport>>) => ({
  attach: p.attach.length,
  products: new Set(p.attach.map((a) => a.slug)).size,
  already: p.already.length,
  missingProducts: p.missingProducts,
  invalid: p.invalid.slice(0, 20),
  conflicts: p.conflicts.slice(0, 20),
});
try {
  console.log(JSON.stringify({ target, plan: planPath, planSha256, imageBase, mode: apply ? "apply" : "dry-run" }));
  if (!apply) console.log(JSON.stringify(summary(await planImageImport(items, imageBase)), null, 1));
  else {
    const res = await applyImageImport(items, imageBase, { id: null });
    console.log(JSON.stringify({ ok: res.ok, ...summary(res.plan), attached: res.ok ? res.attached : 0 }, null, 1));
    if (!res.ok) process.exitCode = 2;
  }
} finally {
  await db.$disconnect();
}
