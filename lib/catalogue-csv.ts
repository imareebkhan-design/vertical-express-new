import { parseRupeeInput } from "@/lib/money";
import { JK_PINCODE } from "@/lib/pincode";

/**
 * Parsing a catalogue CSV.
 *
 * ISS-007 has the catalogue as the largest launch blocker: 45 invented products
 * under 10 invented brands, and the only way to enter a real one is
 * `/admin/listing`, one form submission at a time. At roughly twenty fields a
 * product, a real catalogue is days of typing. This takes a file instead.
 *
 * WHY THIS IS PURE AND SEPARATE
 *
 * The same reason `lib/serviceability-csv.ts` is: a bulk import is the
 * highest-consequence action on the screen it lives on. One bad file lists a
 * product at the wrong price, and a wrong price is money. So parsing and
 * validation happen with no database in reach and are tested directly, and the
 * import applies **all rows or none**.
 *
 * WHY THIS DOES NOT REUSE `parsePincodeCsv`
 *
 * That parser splits on a bare comma. It can, because a pincode never contains
 * one. Product titles in this catalogue do — "OPC 53 Grade Cement, 50 kg Bag" —
 * and a naive split turns that single title into two fields and shifts every
 * column after it. So this file carries a real RFC 4180 reader: quoted fields,
 * "" escapes, embedded commas and newlines, CRLF, and the UTF-8 BOM Excel
 * writes. That reader is the only thing here that is genuinely new.
 *
 * WHAT IS DELIBERATELY NOT A COLUMN
 *
 *   GST rate and HSN — derived from the category via CATEGORY_TAX_CONFIGS in
 *   lib/services/tax.ts, which is owner-confirmed. A per-row column would let a
 *   typo contradict it, and the price here is GST-inclusive anyway.
 *
 *   slug and sku — derived from the title. Nobody should have to invent a URL
 *   slug 200 times, and a hand-typed SKU is a duplicate-key error waiting to
 *   happen.
 *
 *   images — there is no file store configured (see the note in
 *   components/admin/listing-form.tsx), and `npm run check:assets` fails CI on a
 *   product that references an image which is not on disk.
 */

/** The columns, in the order the file must present them. */
export const CATALOGUE_HEADER = [
  "title",
  "brand",
  "category",
  "pack",
  "unit_label",
  "price_rupees",
  "mrp_rupees",
  "stock",
  "warehouse",
  "express",
  "express_pincodes",
  "status",
  "description",
] as const;

export type CatalogueColumn = (typeof CATALOGUE_HEADER)[number];

/** One product, validated as far as a file alone can validate it. */
export interface CatalogueRow {
  /** Physical line in the uploaded file, so an error can be pointed at. */
  line: number;
  title: string;
  /** Derived from the title. The product's URL and its identity for de-duping. */
  slug: string;
  /** Derived from the slug. */
  sku: string;
  /** Written as typed; resolved against Brand by the import service. */
  brand: string;
  /** Written as typed; resolved against Category by the import service. */
  category: string;
  pack: string;
  unitLabel: string;
  pricePaise: number;
  compareAtPaise: number | null;
  stock: number;
  /** Empty when there is no stock to place. */
  warehouse: string;
  express: boolean;
  expressPincodes: string[];
  status: "draft" | "published";
  description: string | null;
}

export interface CsvIssue {
  /** 1-based line number in the file the person uploaded, header included. */
  line: number;
  /** Which column is wrong, when it is one column rather than the row. */
  column?: CatalogueColumn | "header" | "file";
  message: string;
}

/**
 * On failure the rows that *were* valid come back too.
 *
 * So that a file with a typo'd price on line 3 and an unknown brand on line 9
 * reports both in one pass. Returning only the issues means the brand is not
 * looked up at all — nothing resolved line 9 — and the person fixes the price,
 * re-uploads, and meets the brand error on the second round. The whole design
 * here is every problem at once; stopping at the parser quietly breaks it.
 */
export type CatalogueParseResult =
  | { ok: true; rows: CatalogueRow[] }
  | { ok: false; issues: CsvIssue[]; rows: CatalogueRow[] };

/* ------------------------------------------------------------------ */
/* The template                                                        */
/* ------------------------------------------------------------------ */

/**
 * The example rows are commented out, and that is the point.
 *
 * An example needs a price to be legible, and any price written here is a
 * number nobody chose — the exact invented-business-value failure this project
 * keeps having to correct. A `#` line is skipped by the parser, so the template
 * carries no data row at all: uploading it unchanged is an honest "the file has
 * a header but no rows" rather than a product quietly listed at a made-up price.
 *
 * Everything else in the examples is real — UltraTech is a brand the owner has
 * an agreement for, `cement` is a category slug, `Srinagar Central` is the
 * warehouse, 190001 is serviceable — so the shape can be copied without
 * inventing anything.
 */
export const CATALOGUE_CSV_TEMPLATE = [
  CATALOGUE_HEADER.join(","),
  "# Delete these two example lines and add one row per product.",
  "# Lines beginning with # are ignored. Prices INCLUDE GST.",
  "# Leave mrp_rupees blank unless you want a struck-through price.",
  '# "OPC 53 Grade Cement, 50 kg Bag",UltraTech,cement,50 kg bag,per bag,<price>,,500,Srinagar Central,no,,published,',
  '# "Acrylic Wall Putty, 40 kg",<brand>,painting,40 kg bag,per bag,<price>,<mrp>,120,Srinagar Central,yes,190001 190002,published,<optional description>',
  "",
].join("\n");

/* ------------------------------------------------------------------ */
/* RFC 4180 reader                                                     */
/* ------------------------------------------------------------------ */

interface CsvRecord {
  fields: string[];
  /** Line the record starts on. A quoted field may span several. */
  line: number;
}

/**
 * Split CSV text into records.
 *
 * Handles: quoted fields, `""` as a literal quote, commas and newlines inside
 * quotes, CRLF, a leading UTF-8 BOM, blank lines, and `#` comment lines. A
 * comment is recognised only at the start of a record, so a `#` inside a title
 * is just a character.
 */
function readRecords(text: string): CsvRecord[] {
  /* Excel writes a BOM. Left in place it becomes part of the first header cell
     and the header comparison fails with a message that looks like nonsense,
     because the difference is invisible. */
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: CsvRecord[] = [];
  let i = 0;
  let line = 1;

  while (i < src.length) {
    const c = src[i];

    if (c === "\n") {
      i += 1;
      line += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      if (src[i] === "\n") i += 1;
      line += 1;
      continue;
    }
    if (c === "#") {
      while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i += 1;
      continue;
    }

    const startLine = line;
    const fields: string[] = [];
    let field = "";
    let quoted = false;
    let ended = false;

    while (i < src.length && !ended) {
      const ch = src[i];

      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            quoted = false;
            i += 1;
          }
        } else {
          if (ch === "\n") line += 1;
          field += ch;
          i += 1;
        }
        continue;
      }

      if (ch === '"' && field.trim() === "") {
        /* A quote opens a field only at its start, so an inch mark in the
           middle of `1" pipe` stays a character. */
        quoted = true;
        field = "";
        i += 1;
      } else if (ch === ",") {
        fields.push(field);
        field = "";
        i += 1;
      } else if (ch === "\r") {
        i += 1;
      } else if (ch === "\n") {
        i += 1;
        line += 1;
        ended = true;
      } else {
        field += ch;
        i += 1;
      }
    }

    fields.push(field);

    /* A row of nothing but commas is what a spreadsheet leaves behind under the
       last real row. It is not a product and it is not an error. */
    if (fields.some((f) => f.trim() !== "")) {
      records.push({ fields, line: startLine });
    }
  }

  return records;
}

/* ------------------------------------------------------------------ */
/* Field rules                                                         */
/* ------------------------------------------------------------------ */

/**
 * A rupee amount as a spreadsheet hands it over.
 *
 * `parseRupeeInput` is the rule for money and is not changed here — it strips
 * commas and then matches rather than coerces, which is what stops `""`, `NaN`
 * and `1e3` becoming prices. What it does not do is expect a currency symbol,
 * because the form fields it was written for do not have one.
 *
 * A spreadsheet does. Formatting the price column as Currency — the obvious
 * thing to do to a column of prices — makes Excel export `₹385.00`, and every
 * row of a 45-product file then fails on a symbol the person cannot even see
 * in the cell. So the symbol is removed before the real rule runs. Only the
 * symbol: the digits still have to satisfy `parseRupeeInput` exactly.
 */
function parseMoney(raw: string): number | null {
  const withoutSymbol = raw
    .trim()
    .replace(/^(?:₹|rs\.?|inr)\s*/i, "")
    .trim();
  return parseRupeeInput(withoutSymbol);
}

/**
 * A whole number of units, as a spreadsheet hands it over.
 *
 * Two things a cell does that a form field does not. A stock column formatted
 * with a thousands separator exports `1,500`, and a numeric cell that is
 * internally a float exports `500.0`. Both are unambiguously whole numbers and
 * both were being refused, while the price column beside them accepted `1,730`
 * because `parseRupeeInput` strips commas — an inconsistency with no reason
 * behind it.
 *
 * `500.5` is still refused. Half a bag is not a quantity, and quietly rounding
 * it picks a number nobody chose.
 */
function parseQty(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  const m = /^(\d+)(?:\.(0+))?$/.exec(cleaned);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** Yes/no in the spellings a spreadsheet actually produces. */
function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return null;
}

/**
 * A cell a spreadsheet would execute rather than display.
 *
 * Excel and Sheets treat a leading `=`, `+`, `-`, `@`, tab or CR as the start of
 * a formula. A title of `=HYPERLINK("http://…","Cement")` is stored happily,
 * rendered on the storefront as text, and then runs the moment somebody exports
 * the catalogue and opens it. Refusing it on the way in is the only point at
 * which it is cheap.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** URL-safe slug from a title. */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    /* Decompose, then drop the combining marks, so "Café" becomes "cafe" and
       not "caf". Dropping the letter silently shortens a web address and can
       make two different products collide. */
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** The SKU a slug gets, matching scripts/catalog-attributes-backfill.mjs. */
export function skuForSlug(slug: string): string {
  return `VE-${slug.toUpperCase()}`.slice(0, 48);
}

/* ------------------------------------------------------------------ */
/* The parser                                                          */
/* ------------------------------------------------------------------ */

const MAX_ROWS = 2000;

export function parseCatalogueCsv(text: string): CatalogueParseResult {
  const records = readRecords(text);

  if (records.length === 0) {
    return { ok: false, rows: [], issues: [{ line: 1, column: "file", message: "The file is empty" }] };
  }

  const header = records[0];
  const got = header.fields.map((h) => h.trim().toLowerCase());
  if (
    got.length !== CATALOGUE_HEADER.length ||
    CATALOGUE_HEADER.some((h, i) => got[i] !== h)
  ) {
    return {
      ok: false,
      rows: [],
      issues: [
        {
          line: header.line,
          column: "header",
          message: `The header must be exactly: ${CATALOGUE_HEADER.join(",")}`,
        },
      ],
    };
  }

  const body = records.slice(1);
  if (body.length === 0) {
    return {
      ok: false,
      rows: [],
      issues: [{ line: 1, column: "file", message: "The file has a header but no rows" }],
    };
  }
  if (body.length > MAX_ROWS) {
    return {
      ok: false,
      rows: [],
      issues: [
        {
          line: 1,
          column: "file",
          message: `That file has ${body.length} rows. Import at most ${MAX_ROWS} at a time`,
        },
      ],
    };
  }

  const issues: CsvIssue[] = [];
  const rows: CatalogueRow[] = [];
  const slugSeen = new Map<string, number>();
  /* Separate from the slug map, because the two can disagree. A slug keeps 120
     characters and a SKU keeps 48, so two genuinely different long titles can
     slugify apart and still collide once truncated. Left unchecked that
     collision surfaces as a unique-constraint violation halfway through the
     transaction, which rolls the whole file back with an error naming no row. */
  const skuSeen = new Map<string, number>();

  for (const rec of body) {
    const line = rec.line;
    /* One issue per problem, but the row keeps being checked, so a person sees
       everything wrong with it in one pass rather than one mistake per upload. */
    const bad = (column: CsvIssue["column"], message: string) =>
      issues.push({ line, column, message });
    const before = issues.length;

    if (rec.fields.length !== CATALOGUE_HEADER.length) {
      bad(
        "file",
        `Expected ${CATALOGUE_HEADER.length} columns, found ${rec.fields.length}. ` +
          `If a value contains a comma, put it in "quotes"`
      );
      continue;
    }

    const [
      titleRaw, brandRaw, categoryRaw, packRaw, unitRaw, priceRaw, mrpRaw,
      stockRaw, warehouseRaw, expressRaw, pincodesRaw, statusRaw, descriptionRaw,
    ] = rec.fields.map((f) => f.trim());

    /* --- title --- */
    const title = titleRaw;
    if (title === "") bad("title", "A product needs a name");
    else if (FORMULA_START.test(title))
      bad("title", `"${title}" starts with a character a spreadsheet treats as a formula`);
    else if (title.length < 4) bad("title", `"${title}" is too short to be a product name`);
    else if (title.length > 160) bad("title", "That product name is longer than 160 characters");

    const slug = slugifyTitle(title);
    if (title !== "" && slug === "") {
      bad("title", `"${title}" has no letters or digits to make a web address from`);
    } else if (slug !== "") {
      const earlier = slugSeen.get(slug);
      if (earlier !== undefined) {
        bad("title", `"${title}" is the same product as line ${earlier}`);
      } else {
        slugSeen.set(slug, line);
        const sku = skuForSlug(slug);
        const sameSku = skuSeen.get(sku);
        if (sameSku !== undefined) {
          bad(
            "title",
            `"${title}" produces the same item code as line ${sameSku}. ` +
              `Make the first ${sku.length - 3} characters of the two names differ`
          );
        } else {
          skuSeen.set(sku, line);
        }
      }
    }

    /* --- brand and category: existence is the database's question, not ours --- */
    if (brandRaw === "") bad("brand", `"${title}" has no brand`);
    if (categoryRaw === "") bad("category", `"${title}" has no category`);

    /* --- pack and unit --- */
    if (packRaw === "") bad("pack", `"${title}" has no pack size`);
    else if (packRaw.length > 60) bad("pack", "That pack size is longer than 60 characters");
    /* `pack` and `unit_label` are free text that reaches the database and comes
       back out of any export, so they need the same guard the title has. Brand,
       category and warehouse do not: they are looked up, and a value that is
       not a real one is refused before it can be stored. */
    else if (FORMULA_START.test(packRaw))
      bad("pack", `"${packRaw}" starts with a character a spreadsheet treats as a formula`);
    if (unitRaw === "") bad("unit_label", `"${title}" has no unit label, such as "per bag"`);
    else if (unitRaw.length > 40) bad("unit_label", "That unit label is longer than 40 characters");
    else if (FORMULA_START.test(unitRaw))
      bad("unit_label", `"${unitRaw}" starts with a character a spreadsheet treats as a formula`);

    /* --- price. GST-inclusive: this is what the customer pays. --- */
    const pricePaise = parseMoney(priceRaw);
    if (pricePaise === null) {
      bad(
        "price_rupees",
        priceRaw === ""
          ? `"${title}" has no price`
          : `"${priceRaw}" is not a rupee amount — use 385 or 385.50`
      );
    } else if (pricePaise <= 0) {
      bad("price_rupees", `"${title}" has a price of zero`);
    }

    /* --- MRP, optional, and it has to be a real saving --- */
    let compareAtPaise: number | null = null;
    if (mrpRaw !== "") {
      const mrp = parseMoney(mrpRaw);
      if (mrp === null) {
        bad("mrp_rupees", `"${mrpRaw}" is not a rupee amount`);
      } else if (pricePaise !== null && mrp <= pricePaise) {
        /* Otherwise the storefront shows a struck-through price that is not a
           discount, which is a fabricated claim in the literal sense. */
        bad("mrp_rupees", `The MRP for "${title}" is not above its price, so there is no saving to show`);
      } else {
        compareAtPaise = mrp;
      }
    }

    /* --- stock and where it sits --- */
    let stock = 0;
    if (stockRaw !== "") {
      const n = parseQty(stockRaw);
      if (n === null) {
        bad("stock", `"${stockRaw}" is not a whole number of units`);
      } else if (n > 1_000_000) {
        bad("stock", `A stock of ${n} looks like a typo`);
      } else {
        stock = n;
      }
    }
    if (stock > 0 && warehouseRaw === "") {
      bad("warehouse", `"${title}" has stock but no warehouse to put it in`);
    }

    /* --- the 60-minute run --- */
    const express = parseBool(expressRaw);
    if (express === null) {
      bad("express", `"${expressRaw}" is not yes or no`);
    }

    const pincodes: string[] = [];
    const pincodeTokens = pincodesRaw.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    for (const token of pincodeTokens) {
      if (!JK_PINCODE.test(token)) {
        /* The market is Srinagar. A 110054 typed out of habit is Delhi, and
           accepting it promises an hour to a city with no warehouse behind it. */
        bad("express_pincodes", `${token} is not a Srinagar pincode`);
      } else if (!pincodes.includes(token)) {
        pincodes.push(token);
      }
    }
    if (express === true && pincodes.length === 0 && pincodeTokens.length === 0) {
      bad(
        "express_pincodes",
        `"${title}" is marked for 60-minute delivery but lists no pincodes, so it is eligible nowhere`
      );
    }
    if (express === false && pincodeTokens.length > 0) {
      /* Silently dropping the list would leave somebody certain they had set
         this up. Silently honouring it would contradict the column that says
         no. Neither is safe, so it is a question. */
      bad(
        "express_pincodes",
        `"${title}" lists pincodes but express is "no" — set express to yes, or clear the pincodes`
      );
    }

    /* --- status --- */
    const status = statusRaw.toLowerCase();
    if (status !== "draft" && status !== "published") {
      bad("status", `"${statusRaw}" is not draft or published`);
    }

    /* --- description --- */
    if (descriptionRaw.length > 2000) {
      bad("description", "That description is longer than 2000 characters");
    } else if (descriptionRaw !== "" && FORMULA_START.test(descriptionRaw)) {
      bad("description", "That description starts with a character a spreadsheet treats as a formula");
    }

    if (issues.length !== before) continue;

    rows.push({
      line,
      title,
      slug,
      sku: skuForSlug(slug),
      brand: brandRaw,
      category: categoryRaw,
      pack: packRaw,
      unitLabel: unitRaw,
      pricePaise: pricePaise!,
      compareAtPaise,
      stock,
      warehouse: warehouseRaw,
      express: express!,
      expressPincodes: pincodes,
      status: status as "draft" | "published",
      description: descriptionRaw === "" ? null : descriptionRaw,
    });
  }

  /* The valid rows travel with the issues so the caller can still resolve
     brands and categories for them and report everything in one pass. */
  if (issues.length > 0) return { ok: false, rows, issues };
  return { ok: true, rows };
}
