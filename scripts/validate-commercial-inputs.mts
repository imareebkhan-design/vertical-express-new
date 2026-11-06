/**
 * Check the owner's launch commercial-input sheets in one pass (lib/catalog/commercial-inputs.ts).
 *
 *   NODE_PATH=./test-support/stubs node --conditions=react-server --import tsx \
 *     scripts/validate-commercial-inputs.mts --dir=<folder with 1-products.csv and 2-category-gst.csv> \
 *     [--out=<folder>] [--warehouse="Srinagar Central"]
 *
 * Reads two files and writes two: `problems.csv` (every problem, by sheet and line, for the owner) and
 * `plan.json` (the sellable rows exactly as typed, in paise). No database is opened and nothing is
 * imported — applying a plan is a separate, guarded step after the owner has seen it on staging.
 * Exit 0 when there are no problems, 1 otherwise.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const dir = arg("dir");
if (!dir) {
  process.stderr.write("pass --dir=<folder containing 1-products.csv and 2-category-gst.csv>\n");
  process.exit(2);
}
const out = arg("out") ?? dir;
const warehouses = [arg("warehouse") ?? "Srinagar Central"];

const { validateCommercialInputs, problemsCsv } = await import("@/lib/catalog/commercial-inputs");
const report = validateCommercialInputs(
  readFileSync(join(dir, "1-products.csv"), "utf8"),
  readFileSync(join(dir, "2-category-gst.csv"), "utf8"),
  { warehouses },
);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "problems.csv"), problemsCsv(report.problems));
writeFileSync(
  join(out, "plan.json"),
  JSON.stringify({ sellable: report.sellable, categoryTax: report.categoryTax, catalogueOnly: report.catalogueOnly.length }, null, 1) + "\n",
);

const byColumn = new Map<string, number>();
for (const p of report.problems) byColumn.set(`${p.sheet}:${p.column}`, (byColumn.get(`${p.sheet}:${p.column}`) ?? 0) + 1);
console.log(JSON.stringify({
  sellable: report.sellable.length,
  catalogueOnly: report.catalogueOnly.length,
  categoryTaxConfirmed: report.categoryTax.map((t) => t.category),
  problems: report.problems.length,
  problemsByColumn: Object.fromEntries(byColumn),
  wrote: [join(out, "problems.csv"), join(out, "plan.json")],
}, null, 1));
process.exit(report.problems.length ? 1 : 0);
