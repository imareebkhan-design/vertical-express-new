import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { rangeCatalogueSchema } from "@/lib/services/admin/catalogue-range-import";

/**
 * Master catalogue V2.2: V2.1 corrected against the owner's ticked scan (review of 2 Nov 2026,
 * docs/catalog/scan-review-2026-11-02/COMPARISON.md in the workspace).
 *
 * V2.1 imported a range from an unmarked Blum row as Häfele (row 244), split one Greenpanel flooring
 * range into two (row 281), and carried two Häfele rows the scan does not clearly mark (239-240).
 * None of those may come back as a product range.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const bytes = (rel: string) => readFileSync(join(ROOT, rel));
const V21 = "lib/catalog/master-2026-10-01-v2.1.json";
const V22 = "lib/catalog/master-2026-10-01-v2.2.json";

type Outcome = { row: number; state: string; families: string[] };
type Held = { row: number; status: string; classification: string };
type Pending = { id: string; importable: boolean };
const raw = JSON.parse(bytes(V22).toString("utf8")) as {
  basedOn: { "v2.1Sha256": string };
  rowOutcomes: Outcome[];
  held: Held[];
  pending: Pending[];
  families: { slug: string; title: string; sourceRows: number[] }[];
};
const familyRows = (row: number) => raw.families.filter((f) => f.sourceRows.includes(row));
const outcome = (row: number) => raw.rowOutcomes.find((o) => o.row === row)!;

test("V2.2 is accepted by the range importer's schema", () => {
  const parsed = rangeCatalogueSchema.safeParse(raw);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
});

test("V2.2 is derived from the V2.1 file as committed, which stays unchanged", () => {
  assert.equal(createHash("sha256").update(bytes(V21)).digest("hex"), raw.basedOn["v2.1Sha256"]);
});

test("row 244 (an unmarked Blum row, mislabelled Häfele in V2.1) creates no range", () => {
  assert.equal(outcome(244).state, "EXCLUDED");
  assert.deepEqual(familyRows(244), []);
  assert.ok(!raw.families.some((f) => f.title === "Häfele Wardrobe / Furniture Hardware"));
});

test("row 281 is Greenpanel Wood Flooring, one range with row 264, not a second flooring range", () => {
  const hits = familyRows(281);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, "Greenpanel Wood Flooring");
  assert.deepEqual(hits[0].sourceRows, [264, 281]);
  assert.ok(!raw.families.some((f) => f.title === "Greenpanel Engineered Wood Flooring"));
});

test("rows the scan does not clearly establish are held, never imported", () => {
  const unclear = [118, 119, 120, 121, 146, 239, 240, 269, 270, 271, 272, 327, 328, 329, 354];
  for (const row of unclear) {
    assert.equal(outcome(row).state, "HELD", `row ${row}`);
    assert.deepEqual(familyRows(row), [], `row ${row} has a range`);
    assert.equal(raw.held.find((h) => h.row === row)?.status, "HELD", `row ${row} missing from held`);
  }
  assert.ok(raw.pending.length > 0 && raw.pending.every((p) => !p.importable));
});

test("the import script defaults to V2.2", () => {
  assert.match(bytes("scripts/import-catalogue-ranges.mts").toString("utf8"), /master-2026-10-01-v2\.2\.json/);
});
