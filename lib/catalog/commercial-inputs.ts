import { parseMoney, parseQty, readRecords } from "@/lib/catalogue-csv";
import { priceProblem } from "@/lib/services/admin/variant-pricing";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";

/**
 * Validates the owner's launch commercial-input sheets
 * (workspace `docs/catalog/launch-commercial-inputs-2026-10-10/`) in one pass.
 *
 * Pure: no database, no writes. It turns the two CSV files into either a list
 * of problems the owner can fix in one sitting, or a normalised plan of exactly
 * what they said. Nothing is defaulted that is a business value — a blank
 * price, stock, pack, delivery class or GST stays a problem, never a guess.
 * The rules are the ones the shop already enforces when it decides a product
 * is sellable (`validateCommercialReadiness`, `priceProblem`), applied early so
 * a sheet that passes here does not fail later at the gate.
 *
 * Columns are found by the start of their header (`selling_price_INR…`), so a
 * spreadsheet round-trip that edits the hint text in brackets still parses.
 * Reading, money and quantities use the catalogue importer's rules
 * (`lib/catalogue-csv.ts`), so a cell means the same thing in both.
 */

export const DELIVERY_SPEEDS = ["express", "scheduled"] as const;
export type DeliverySpeed = (typeof DELIVERY_SPEEDS)[number];

/** Same shape the commercial review requires (`commercialReviewSchema.hsn`). */
const HSN = /^\d{4}(?:\d{2})?(?:\d{2})?$/;

export interface SheetProblem {
  sheet: "products" | "category-gst";
  /** Spreadsheet line the row starts on (line 1 is the header). */
  row: number;
  key: string;
  column: string;
  problem: string;
}

export interface SellableRow {
  slug: string;
  title: string;
  category: string;
  pack: string;
  deliverySpeed: DeliverySpeed;
  pricePaise: number;
  compareAtPaise: number | null;
  openingStock: number;
  warehouse: string;
  notes: string;
}

export interface CategoryTax {
  category: string;
  hsn: string;
  ratePct: number;
  confirmedBy: string;
}

export interface CommercialInputReport {
  problems: SheetProblem[];
  sellable: SellableRow[];
  /** Rows left as "Price on request" (SELL_ONLINE blank or N). */
  catalogueOnly: string[];
  categoryTax: CategoryTax[];
}

export interface ValidateOptions {
  /** Active warehouse names; a blank cell means the first. */
  warehouses: string[];
  /** Explicit checkout tax mappings already in code. */
  existingTax?: Record<string, { hsn: string; ratePct: number }>;
}

function columns(header: string[], wanted: Record<string, string>, sheet: SheetProblem["sheet"], problems: SheetProblem[]) {
  const at: Record<string, number> = {};
  for (const [name, prefix] of Object.entries(wanted)) {
    const i = header.findIndex((h) => h.trim().toLowerCase().startsWith(prefix.toLowerCase()));
    if (i < 0) problems.push({ sheet, row: 1, key: "(header)", column: prefix, problem: `Column "${prefix}" is missing` });
    at[name] = i;
  }
  return at;
}

export function validateCommercialInputs(productsCsv: string, categoryGstCsv: string, opts: ValidateOptions): CommercialInputReport {
  const problems: SheetProblem[] = [];
  const existingTax = opts.existingTax ?? CATEGORY_TAX_CONFIGS;

  /* ---- sheet 2: GST per category ---- */
  const gstRows = readRecords(categoryGstCsv);
  const g = columns(gstRows[0]?.fields ?? [], { category: "category", hsn: "HSN_code", rate: "GST_rate_pct", by: "confirmed_by" }, "category-gst", problems);
  const categoryTax: CategoryTax[] = [];
  const gstFromSheet = new Map<string, CategoryTax>();
  if (Object.values(g).every((i) => i >= 0)) {
    gstRows.slice(1).forEach(({ fields: r, line: row }) => {
      const category = (r[g.category] ?? "").trim();
      const hsn = (r[g.hsn] ?? "").trim();
      const rateRaw = (r[g.rate] ?? "").trim().replace(/%$/, "");
      const by = (r[g.by] ?? "").trim();
      const p = (column: string, problem: string) => problems.push({ sheet: "category-gst", row, key: category, column, problem });
      if (!hsn && !rateRaw && !by) return; // not answered yet; reported where a product needs it
      if (!HSN.test(hsn)) p("HSN_code", hsn ? `"${hsn}" is not a 4, 6 or 8 digit HSN code` : "HSN code is blank");
      const rate = Number(rateRaw);
      if (!rateRaw || !Number.isFinite(rate) || rate < 0 || rate > 100) p("GST_rate_pct", rateRaw ? `"${rateRaw}" is not a percentage` : "GST rate is blank");
      if (!by) p("confirmed_by", "Say who confirmed this (e.g. your CA's name)");
      const known = existingTax[category];
      if (known && (known.hsn !== hsn || known.ratePct !== rate)) {
        p("HSN_code", `The shop already uses HSN ${known.hsn} at ${known.ratePct}% for this category; confirm which is right`);
      }
      if (HSN.test(hsn) && rateRaw && Number.isFinite(rate) && rate >= 0 && rate <= 100 && by) {
        const t = { category, hsn, ratePct: rate, confirmedBy: by };
        gstFromSheet.set(category, t);
        categoryTax.push(t);
      }
    });
  }

  /* ---- sheet 1: products ---- */
  const rows = readRecords(productsCsv);
  const c = columns(rows[0]?.fields ?? [], {
    slug: "slug", title: "title", category: "category", sell: "SELL_ONLINE", pack: "pack_or_variant",
    delivery: "delivery", price: "selling_price_INR", mrp: "MRP_INR", stock: "opening_stock", warehouse: "warehouse", notes: "notes",
  }, "products", problems);
  const sellable: SellableRow[] = [];
  const catalogueOnly: string[] = [];
  if (Object.values(c).some((i) => i < 0)) return { problems, sellable, catalogueOnly, categoryTax };

  const seen = new Map<string, number>();
  const missingGst = new Set<string>();
  rows.slice(1).forEach(({ fields: r, line: row }) => {
    const cell = (k: keyof typeof c) => (r[c[k]] ?? "").trim();
    const slug = cell("slug");
    const p = (column: string, problem: string) => problems.push({ sheet: "products", row, key: slug, column, problem });
    if (!slug) return p("slug", "Row has no product slug");
    if (seen.has(slug)) return p("slug", `Same product as row ${seen.get(slug)}`);
    seen.set(slug, row);

    const sell = cell("sell").toUpperCase();
    const commercial = ["pack", "delivery", "price", "mrp", "stock", "warehouse"] as const;
    if (sell === "" || sell === "N" || sell === "NO") {
      catalogueOnly.push(slug);
      const filled = commercial.filter((k) => cell(k) !== "");
      if (filled.length) p("SELL_ONLINE", "Values are filled but SELL_ONLINE is not Y, so they will be ignored. Set Y to sell, or clear them");
      return;
    }
    if (sell !== "Y" && sell !== "YES") return p("SELL_ONLINE", `"${cell("sell")}" — use Y or N`);

    const before = problems.length;
    const pack = cell("pack");
    if (!pack) p("pack_or_variant", "Say what one unit is");

    const deliveryRaw = cell("delivery").toLowerCase();
    const deliverySpeed = (DELIVERY_SPEEDS as readonly string[]).includes(deliveryRaw) ? (deliveryRaw as DeliverySpeed) : null;
    if (!deliverySpeed) p("delivery", deliveryRaw ? `"${cell("delivery")}" — use express or scheduled` : "Choose express or scheduled");

    const pricePaise = cell("price") ? parseMoney(cell("price")) : null;
    if (pricePaise === null) p("selling_price_INR_incl_GST", cell("price") ? `"${cell("price")}" is not a rupee amount` : "Selling price is blank");
    const mrpRaw = cell("mrp");
    const compareAtPaise = mrpRaw ? parseMoney(mrpRaw) : null;
    if (mrpRaw && compareAtPaise === null) p("MRP_INR", `"${mrpRaw}" is not a rupee amount`);
    if (pricePaise !== null && !(mrpRaw && compareAtPaise === null)) {
      const why = priceProblem(pricePaise, compareAtPaise);
      if (why) p(why.includes("MRP") ? "MRP_INR" : "selling_price_INR_incl_GST", why);
    }

    const stockRaw = cell("stock");
    const openingStock = stockRaw ? parseQty(stockRaw) : null;
    if (openingStock === null || openingStock > 2_147_483_647) {
      p("opening_stock_units", stockRaw ? `"${stockRaw}" — a whole number, 0 or more` : "Opening stock is blank (0 is allowed)");
    }

    const warehouse = cell("warehouse") || opts.warehouses[0] || "";
    if (!opts.warehouses.some((w) => w.toLowerCase() === warehouse.toLowerCase())) {
      p("warehouse", `"${warehouse}" is not an active warehouse (${opts.warehouses.join(", ") || "none"})`);
    }

    const category = cell("category");
    if (!existingTax[category] && !gstFromSheet.has(category)) {
      missingGst.add(category);
      p("category", `GST for "${category}" is not confirmed — complete it in 2-category-gst.csv`);
    }

    if (problems.length === before) {
      sellable.push({
        slug, title: cell("title"), category, pack, deliverySpeed: deliverySpeed!, pricePaise: pricePaise!,
        compareAtPaise, openingStock: openingStock!, warehouse, notes: cell("notes"),
      });
    }
  });

  return { problems, sellable, catalogueOnly, categoryTax };
}

/** The problems as a CSV the owner can open next to their sheet. */
export function problemsCsv(problems: SheetProblem[]): string {
  const q = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  return ["sheet,row,product_or_category,column,problem", ...problems.map((p) => [p.sheet, p.row, p.key, p.column, p.problem].map(q).join(","))].join("\n") + "\n";
}
