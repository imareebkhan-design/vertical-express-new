"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/services/admin/authz";
import { parseCatalogueCsv, type CsvIssue } from "@/lib/catalogue-csv";
import {
  importCatalogue,
  previewCatalogue,
  type ImportPreview,
  type ImportResult,
} from "@/lib/services/admin/catalogue-import";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Bulk-listing the catalogue from a file.
 *
 * ISS-007 — 45 invented products under 10 invented brands — is the largest
 * launch blocker, and the only way to enter a real one was `/admin/listing`, a
 * form at a time. This is the same work as a spreadsheet.
 *
 * Two actions rather than one, because writing two hundred products is worth
 * looking at first. `adminPreviewCatalogue` writes nothing; `adminImportCatalogue`
 * re-parses and re-validates the file from the beginning rather than trusting
 * anything the preview returned. A browser is not a source of truth, and the
 * gap between "what you were shown" and "what gets written" is exactly where a
 * price nobody typed would get in.
 */

/**
 * Characters, not bytes — `String.length` counts UTF-16 units. Generous either
 * way, and bigger than the serviceability cap because a product row is far
 * wider than a pincode. At roughly 150 characters a row this is well past the
 * 2,000-row limit the parser enforces.
 */
const MAX_CHARS = 2_000_000;

/** Line-numbered, capped, and the whole list in metadata for the UI to group. */
function issuesToFailure<T>(issues: CsvIssue[]): ActionResult<T> {
  /* Every problem at once. Reporting only the first means a person fixes one
     row, re-uploads, and finds the next — for as many rounds as there are
     mistakes. The cap is on what goes in the sentence, not on what is sent. */
  const shown = issues.slice(0, 12).map((i) => `Line ${i.line}: ${i.message}`);
  const more = issues.length - shown.length;
  return fail(
    "VALIDATION",
    shown.join("\n") + (more > 0 ? `\n…and ${more} more` : ""),
    undefined,
    { issues }
  );
}

/** The uploaded text, or why it cannot be used. */
function readPayload(csv: unknown): { ok: true; text: string } | { ok: false; message: string } {
  if (typeof csv !== "string") return { ok: false, message: "That file could not be read as text" };
  if (csv.length > MAX_CHARS) {
    return { ok: false, message: "That file is too large to import in one go" };
  }
  return { ok: true, text: csv };
}

/**
 * Everything wrong with a file, from both halves of the check.
 *
 * The parser hands back the rows that were individually valid even when others
 * were not, so the brands and categories on *those* can still be looked up.
 * Otherwise a typo'd price on line 3 hides an unknown brand on line 9 until the
 * second upload, and the person fixes the file one round per mistake.
 */
async function collect(text: string): Promise<{ preview: ImportPreview; issues: CsvIssue[] }> {
  const parsed = parseCatalogueCsv(text);
  const preview =
    parsed.rows.length > 0
      ? await previewCatalogue(parsed.rows)
      : { toCreate: [], skipped: [], issues: [] };

  const issues = [...(parsed.ok ? [] : parsed.issues), ...preview.issues].sort(
    (a, b) => a.line - b.line
  );
  return { preview, issues };
}

/** Check a file and report what would happen. Writes nothing. */
export async function adminPreviewCatalogue(csv: unknown): Promise<ActionResult<ImportPreview>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const payload = readPayload(csv);
  if (!payload.ok) return fail("VALIDATION", payload.message);

  const { preview, issues } = await collect(payload.text);
  if (issues.length > 0) return issuesToFailure(issues);

  return succeed(preview);
}

/** Write the file, all of it or none of it. */
export async function adminImportCatalogue(csv: unknown): Promise<ActionResult<ImportResult>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const payload = readPayload(csv);
  if (!payload.ok) return fail("VALIDATION", payload.message);
  const text = payload.text;

  /* Re-checked from the file rather than from anything the preview returned.
     A browser is not a source of truth, and the gap between what was shown and
     what gets written is exactly where a price nobody typed would get in. */
  const { issues } = await collect(text);
  if (issues.length > 0) return issuesToFailure(issues);

  const parsed = parseCatalogueCsv(text);
  if (!parsed.ok) return issuesToFailure(parsed.issues);

  const res = await importCatalogue(parsed.rows, admin);
  if (!res.ok) return fail("CONFLICT", res.error);

  /* Once, after the transaction. The single-product action revalidates four
     paths including the whole storefront layout; doing that per row would be
     two hundred layout invalidations for one decision. */
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/listing");
  revalidatePath("/", "layout");

  return succeed(res.result);
}
