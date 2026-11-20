import { readRecords, parseMoney, parseQty } from "@/lib/catalogue-csv";

/**
 * Updating products already in the catalogue from a file.
 *
 * `lib/catalogue-csv.ts` lists NEW products and skips anything already on the
 * shelf — deliberately, so a stray row cannot reprice a product. The catalogue
 * now exists (draft and catalogue-only families with their URLs, photos and
 * approvals), and what it lacks is variants, MRPs, prices and stock. This is
 * the file for that: it never creates a product, and it identifies everything
 * by a stable key rather than by title.
 *
 *   - Product: `product_slug`. The slug is the product's URL; nothing here
 *     changes it, so links, photos, approvals and order history stay attached.
 *   - Variant: `sku`, unique across the shop. A SKU already on another product
 *     is a conflict, never a move.
 *   - Stale edits: an existing variant's row carries the price and MRP the
 *     operator's export showed (`current_*`). If the shop no longer says that,
 *     the row is a conflict, and someone else's change is not overwritten.
 *
 * Two sheets, two separate steps, because they are different decisions:
 * prices and variants (`VARIANT_UPDATE_HEADER`) and shelf counts
 * (`STOCK_COUNT_HEADER`). Publication is a third, done product by product in
 * the console through the publish gate. Nothing in a file publishes.
 *
 * Pure: shapes, numbers and contradictions within the file. The database
 * questions live in `lib/services/admin/catalogue-update.ts`.
 */

export const VARIANT_UPDATE_HEADER = [
  "product_slug",
  "sku",
  "variant_name",
  "make_default",
  "mrp_rupees",
  "price_rupees",
  "current_mrp_rupees",
  "current_price_rupees",
  "mrp_evidence",
] as const;

export const STOCK_COUNT_HEADER = ["sku", "warehouse", "counted_qty", "current_on_hand", "note"] as const;

export type VariantUpdateColumn = (typeof VARIANT_UPDATE_HEADER)[number];
export type StockCountColumn = (typeof STOCK_COUNT_HEADER)[number];

export interface UpdateIssue {
  line: number;
  column?: string;
  message: string;
}

export interface VariantUpdateRow {
  line: number;
  productSlug: string;
  sku: string;
  /** Blank keeps an existing variant's name; a new variant needs one. */
  variantName: string | null;
  makeDefault: boolean;
  mrpPaise: number;
  pricePaise: number;
  /** What the operator's export showed. Both null for a SKU that is new. */
  currentMrpPaise: number | null;
  currentPricePaise: number | null;
  /** Both `current_*` cells were blank. */
  claimsNew: boolean;
  mrpEvidence: string;
}

export interface StockCountRow {
  line: number;
  sku: string;
  warehouse: string;
  countedQty: number;
  /** Blank means "no stock record exists yet". */
  currentOnHand: number | null;
  note: string;
}

export interface ParseResult<R> {
  rows: R[];
  issues: UpdateIssue[];
}

const MAX_ROWS = 5000;
const FORMULA_START = /^[=+\-@\t\r]/;
const SKU_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{1,63}$/;

function body<H extends readonly string[]>(text: string, header: H, issues: UpdateIssue[]) {
  const records = readRecords(text);
  if (records.length === 0) {
    issues.push({ line: 1, column: "file", message: "The file is empty" });
    return [];
  }
  const got = records[0].fields.map((h) => h.trim().toLowerCase());
  if (got.length !== header.length || header.some((h, i) => got[i] !== h)) {
    issues.push({ line: records[0].line, column: "header", message: `The header must be exactly: ${header.join(",")}` });
    return [];
  }
  const rows = records.slice(1);
  if (rows.length === 0) issues.push({ line: 1, column: "file", message: "The file has a header but no rows" });
  if (rows.length > MAX_ROWS) {
    issues.push({ line: 1, column: "file", message: `That file has ${rows.length} rows. Use at most ${MAX_ROWS} at a time` });
    return [];
  }
  return rows.map((r) => ({
    line: r.line,
    cell: (col: H[number]) => (r.fields[header.indexOf(col)] ?? "").trim(),
    width: r.fields.length,
  }));
}

function yes(raw: string): boolean | null {
  const v = raw.toLowerCase();
  if (v === "" || ["no", "n", "false", "0"].includes(v)) return false;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  return null;
}

export function parseVariantUpdates(text: string): ParseResult<VariantUpdateRow> {
  const issues: UpdateIssue[] = [];
  const rows: VariantUpdateRow[] = [];
  const seenSku = new Map<string, number>();
  const defaults = new Map<string, number>();

  for (const r of body(text, VARIANT_UPDATE_HEADER, issues)) {
    const bad = (column: VariantUpdateColumn | "row", message: string) => issues.push({ line: r.line, column, message });
    const before = issues.length;
    if (r.width !== VARIANT_UPDATE_HEADER.length) bad("row", `Expected ${VARIANT_UPDATE_HEADER.length} cells, found ${r.width}`);

    const productSlug = r.cell("product_slug").toLowerCase();
    const sku = r.cell("sku");
    const variantName = r.cell("variant_name") || null;
    const evidence = r.cell("mrp_evidence");
    if (!productSlug) bad("product_slug", "Which product? The product_slug is blank");
    if (!SKU_SHAPE.test(sku)) bad("sku", sku ? `"${sku}" is not a SKU — letters, numbers and . _ - / only` : "The SKU is blank");
    if (variantName && variantName.length > 80) bad("variant_name", "The variant name is longer than 80 characters");
    for (const [col, v] of [["variant_name", variantName ?? ""], ["mrp_evidence", evidence]] as const) {
      if (FORMULA_START.test(v)) bad(col, "A cell may not start with = + - @ (a spreadsheet would run it as a formula)");
    }

    const makeDefault = yes(r.cell("make_default"));
    if (makeDefault === null) bad("make_default", `"${r.cell("make_default")}" — use yes or leave it blank`);

    /* The owner's rule: an MRP for every sellable variant, and the price at or
       below it. A blank is never read as zero or as "same as the price". */
    const money = (col: "mrp_rupees" | "price_rupees" | "current_mrp_rupees" | "current_price_rupees", required: boolean) => {
      const raw = r.cell(col);
      if (raw === "") {
        if (required) bad(col, `The ${col.startsWith("mrp") ? "MRP" : "price"} is blank`);
        return null;
      }
      const v = parseMoney(raw);
      if (v === null || v <= 0) bad(col, `"${raw}" is not a rupee amount above zero`);
      return v !== null && v > 0 ? v : null;
    };
    const mrpPaise = money("mrp_rupees", true);
    const pricePaise = money("price_rupees", true);
    const currentMrpPaise = money("current_mrp_rupees", false);
    const currentPricePaise = money("current_price_rupees", false);
    if (mrpPaise !== null && pricePaise !== null && pricePaise > mrpPaise) bad("price_rupees", "The selling price cannot be above the MRP");
    const claimsNew = r.cell("current_mrp_rupees") === "" && r.cell("current_price_rupees") === "";
    if (!claimsNew && r.cell("current_price_rupees") === "") {
      bad("current_price_rupees", "Give the price the export showed (current_price_rupees), or leave both current_ cells blank for a new SKU");
    }
    if (claimsNew && !variantName) bad("variant_name", "A new SKU needs a variant name, e.g. \"50 kg bag\"");

    if (sku) {
      const first = seenSku.get(sku.toLowerCase());
      if (first !== undefined) bad("sku", `SKU "${sku}" is already on line ${first}; one row per SKU`);
      else seenSku.set(sku.toLowerCase(), r.line);
    }
    if (makeDefault && productSlug) {
      const first = defaults.get(productSlug);
      if (first !== undefined) bad("make_default", `Line ${first} already makes another variant of "${productSlug}" the default`);
      else defaults.set(productSlug, r.line);
    }

    if (issues.length === before && mrpPaise !== null && pricePaise !== null) {
      rows.push({
        line: r.line, productSlug, sku, variantName, makeDefault: makeDefault === true,
        mrpPaise, pricePaise, currentMrpPaise, currentPricePaise, claimsNew, mrpEvidence: evidence,
      });
    }
  }
  return { rows, issues };
}

export function parseStockCounts(text: string): ParseResult<StockCountRow> {
  const issues: UpdateIssue[] = [];
  const rows: StockCountRow[] = [];
  const seen = new Map<string, number>();

  for (const r of body(text, STOCK_COUNT_HEADER, issues)) {
    const bad = (column: StockCountColumn | "row", message: string) => issues.push({ line: r.line, column, message });
    const before = issues.length;
    if (r.width !== STOCK_COUNT_HEADER.length) bad("row", `Expected ${STOCK_COUNT_HEADER.length} cells, found ${r.width}`);
    const sku = r.cell("sku");
    const warehouse = r.cell("warehouse");
    const note = r.cell("note");
    if (!SKU_SHAPE.test(sku)) bad("sku", sku ? `"${sku}" is not a SKU` : "The SKU is blank");
    if (!warehouse) bad("warehouse", "Which warehouse was counted?");
    if (FORMULA_START.test(note)) bad("note", "A cell may not start with = + - @");

    /* A count is what was found on the shelf. Blank is not zero: a blank count
       is a mistake, and an explicit 0 is a real, sellable-as-out-of-stock answer. */
    const countedRaw = r.cell("counted_qty");
    const countedQty = countedRaw === "" ? null : parseQty(countedRaw);
    if (countedQty === null) bad("counted_qty", countedRaw ? `"${countedRaw}" is not a whole number` : "The count is blank — enter 0 if the shelf is empty");
    const currentRaw = r.cell("current_on_hand");
    const currentOnHand = currentRaw === "" ? null : parseQty(currentRaw);
    if (currentRaw !== "" && currentOnHand === null) bad("current_on_hand", `"${currentRaw}" is not a whole number`);

    const key = `${sku.toLowerCase()}@${warehouse.toLowerCase()}`;
    const first = seen.get(key);
    if (sku && warehouse && first !== undefined) bad("sku", `"${sku}" at "${warehouse}" is already counted on line ${first}`);
    else seen.set(key, r.line);

    if (issues.length === before && countedQty !== null) {
      rows.push({ line: r.line, sku, warehouse, countedQty, currentOnHand, note });
    }
  }
  return { rows, issues };
}

/** A cell for the export: quoted when it must be, never left to run as a formula. */
export function csvCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  const safe = FORMULA_START.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function rupees(paise: number | null): string {
  if (paise === null) return "";
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
