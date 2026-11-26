/**
 * Dry-run a variant update file against a product snapshot, with no database.
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --import tsx \
 *     scripts/dry-run-catalogue-update.mts --snapshot=<staging-products.json> \
 *     --variants=<update.csv> --out=<new folder>
 *
 * Runs the real parser and planner (lib/catalogue-update-csv.ts,
 * lib/services/admin/catalogue-update.ts) over a read-only snapshot of
 * products and variants — the shape written by the 2 Nov 2026 catalogue
 * reconciliation — instead of a live database. Writes `dry-run-rows.csv` (every
 * row with its action and reason) and `dry-run-summary.json`. Nothing is
 * imported; the live preview in Operations remains the check that matters.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const [snapshotPath, variantsPath, out] = [arg("snapshot"), arg("variants"), arg("out")];
if (!snapshotPath || !variantsPath || !out) {
  process.stderr.write("pass --snapshot=<json> --variants=<csv> --out=<new folder>\n");
  process.exit(2);
}
if (existsSync(join(out, "dry-run-summary.json"))) {
  process.stderr.write("That folder already has a dry run; use a new one\n");
  process.exit(2);
}

interface SnapVariant { sku: string; name: string; pricePaise: number; compareAtPaise: number | null; active: boolean; default: boolean }
interface SnapProduct { slug: string; status: string; variants: SnapVariant[] }
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as SnapProduct[];

/* The two reads the planner makes, answered from the snapshot. */
const fake = {
  product: {
    findMany: async ({ where }: { where: { slug: { in: string[] } } }) =>
      snapshot.filter((p) => where.slug.in.includes(p.slug)).map((p) => ({
        id: p.slug, slug: p.slug, status: p.status,
        variants: p.variants.map((v) => ({ id: v.sku, sku: v.sku, name: v.name, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise, isDefault: v.default, isActive: v.active })),
      })),
  },
  productVariant: {
    findMany: async ({ where }: { where: { sku: { in: string[] } } }) => {
      const want = new Set(where.sku.in.map((s) => s.toLowerCase()));
      return snapshot.flatMap((p) => p.variants.filter((v) => want.has(v.sku.toLowerCase())).map((v) => ({ id: v.sku, sku: v.sku, productId: p.slug, product: { slug: p.slug } })));
    },
  },
};

const { parseVariantUpdates, csvCell } = await import("@/lib/catalogue-update-csv");
const { planVariantUpdates } = await import("@/lib/services/admin/catalogue-update");
const text = readFileSync(variantsPath, "utf8");
const parsed = parseVariantUpdates(text);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a two-method stand-in for the Prisma client
const plan = await planVariantUpdates(fake as any, parsed);

/* How many rows have each kind of problem (quoted values stripped so like counts with like). */
const missing = new Map<string, number>();
for (const i of parsed.issues) {
  const kind = `${i.column ?? "row"}: ${i.message.replace(/"[^"]*"/g, "…")}`;
  missing.set(kind, (missing.get(kind) ?? 0) + 1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "dry-run-rows.csv"), ["line,action,product_slug_or_column,sku,changes,reason",
  ...plan.rows.map((r) => [r.line, r.action, r.scope, r.sku, r.changes.map((c) => `${c.field}:${c.from}->${c.to}`).join("; "), r.message ?? ""].map((v) => csvCell(v as string | number)).join(",")),
].join("\n") + "\n");
const summary = {
  mode: "offline dry run against a snapshot — nothing imported",
  input: { file: variantsPath, sha256: createHash("sha256").update(text).digest("hex"), dataRows: text.trim().split("\n").length - 1 },
  snapshot: { file: snapshotPath, products: snapshot.length },
  counts: plan.counts,
  applicable: plan.applicable,
  problemsByKind: Object.fromEntries([...missing.entries()].sort((a, b) => b[1] - a[1])),
  databaseWrites: 0,
};
writeFileSync(join(out, "dry-run-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ counts: plan.counts, applicable: plan.applicable }));
