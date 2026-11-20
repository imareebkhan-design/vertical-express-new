/** Production URL cutover AFTER deploying the two-bucket image allowlist.
 * Dry-run by default. Reversible with --rollback using the same manifest.
 * Never changes product status, image approval or image identity.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const file = arg("manifest");
const expectedRef = arg("expect-ref");
const url = new URL(process.env.DATABASE_URL ?? "http://unset");
const localRehearsal = process.argv.includes("--local-rehearsal") && process.env.VE_TEST_DATABASE === "1" && ["localhost", "127.0.0.1"].includes(url.hostname);
const actualRef = localRehearsal ? "localhost" : (decodeURIComponent(url.username) + " " + url.hostname).match(/[a-z]{20}/)?.[0];
if (!file || !expectedRef || actualRef !== expectedRef) throw new Error("Pass --manifest and --expect-ref matching the target database");
if (expectedRef !== "gsfslnxvwmrgulzqypdp" && !(localRehearsal && expectedRef === "localhost")) throw new Error("This cutover is scoped to the verified production database or an explicit local rehearsal");
const source = "https://storage.googleapis.com/ve-staging-product-images";
const dest = "https://storage.googleapis.com/ve-production-product-images";
const manifest = z.object({
  sourceBase: z.literal(source), destBase: z.literal(dest),
  copy: z.array(z.object({ id: z.string().uuid(), from: z.string().url(), to: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(1),
  problems: z.array(z.unknown()).length(0), local: z.array(z.unknown()).length(0),
}).parse(JSON.parse(readFileSync(file, "utf8")));
const rollback = process.argv.includes("--rollback");
const apply = process.argv.includes("--apply");
const seen = new Set<string>();
for (const item of manifest.copy) {
  if (seen.has(item.id)) throw new Error("Duplicate image id");
  seen.add(item.id);
  if (!item.from.startsWith(source + "/") || item.to !== dest + item.from.slice(source.length)) throw new Error("Unexpected object mapping");
  const response = await fetch(rollback ? item.from : item.to, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Image ${item.id} unavailable`);
  const hash = createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
  if (hash !== item.sha256) throw new Error(`Image ${item.id} hash mismatch`);
}
process.env.VE_DEPLOY_ENV = "production";
const { db } = await import("@/lib/db");
const { approvedImageWhere } = await import("@/lib/catalog-policy");
try {
  // An explicit destination-ready acknowledgement is required for the write:
  // deploying the old CSP with the new URLs would break the storefront images.
  if (apply && arg("allowlist-verified") !== "yes") throw new Error("Verify deployed CSP and Next image allowlist, then pass --allowlist-verified=yes");
  await db.$transaction(async (tx) => {
    for (const item of manifest.copy) {
      const from = rollback ? item.to : item.from;
      const to = rollback ? item.from : item.to;
      const where = { AND: [approvedImageWhere(), { id: item.id, url: from, sha256: item.sha256 }] };
      if (!apply) {
        if (await tx.productImage.count({ where }) !== 1) throw new Error(`Image ${item.id} changed since manifest`);
        continue;
      }
      if ((await tx.productImage.updateMany({ where, data: { url: to } })).count !== 1) throw new Error(`Image ${item.id} changed since manifest; rolling back all URLs`);
      // The catalogue trigger intentionally revokes approval when a URL changes.
      // Never commit a relocation that silently removes a product from public view,
      // and never manufacture replacement owner approvals to make it succeed.
      if (await tx.productImage.count({ where: { AND: [approvedImageWhere(), { id: item.id, url: to, sha256: item.sha256 }] } }) !== 1) {
        throw new Error(`Image ${item.id} approval invalidated by URL relocation; transaction rolled back. An approval-preserving migration must be reviewed before cutover.`);
      }
      await tx.auditLog.create({ data: {
        actorType: "system", action: rollback ? "product_image.rehome_rollback" : "product_image.rehomed",
        entityType: "product_image", entityId: item.id,
        before: { url: from, sha256: item.sha256 },
        after: { url: to, sha256: item.sha256, reason: "Owner-authorised production image isolation; Codex readiness task" },
      } });
    }
  }, { timeout: 60_000 });
  console.log(JSON.stringify({ verified: manifest.copy.length, changed: apply ? manifest.copy.length : 0, rollback }));
} finally { await db.$disconnect(); }
