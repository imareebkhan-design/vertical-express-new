import { readFile, writeFile } from "node:fs/promises";
import { previewEnrichment } from "../lib/catalogue-enrichment-preview";

const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error("Usage: node --import tsx scripts/preview-catalogue-enrichment.mts INPUT.json CONTEXT.json NEW_REPORT.json");
  process.exitCode = 2;
} else {
  try {
    const [input, context] = await Promise.all(args.slice(0, 2).map(async path => JSON.parse(await readFile(path, "utf8")) as unknown));
    const report = previewEnrichment(input, context);
    await writeFile(args[2], JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ readyForDatabaseReview: report.readyForDatabaseReview, issues: report.issues.length, databaseWrites: 0 }));
    if (!report.readyForDatabaseReview) process.exitCode = 1;
  } catch {
    console.error("Preview failed: check input JSON and use a new report path. No database connection was made.");
    process.exitCode = 2;
  }
}
