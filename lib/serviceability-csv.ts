/**
 * Parsing a serviceability CSV.
 *
 * Real operations manage serviceability in bulk — a courier changes its
 * coverage and forty pincodes move at once. Typing those one at a time is how
 * a row gets missed, so the console takes a file.
 *
 * WHY THIS IS PURE AND SEPARATE
 *
 * A bulk import is the highest-consequence thing on the serviceability screen:
 * one bad file can tell every customer in a district that we deliver when we do
 * not, or stop selling to one that we do. The parsing and validation therefore
 * happen with no database in reach and are tested directly, and the import
 * applies **all rows or none** — a half-applied file leaves coverage in a state
 * nobody chose and nobody can see.
 *
 * The pincode rule is the market, not an invention: CLAUDE.md states Srinagar,
 * Jammu & Kashmir is the first and only market, and J&K pincodes begin 18 or 19.
 * A Mumbai pincode in this file is a mistake every time. When the business
 * expands, this check is the thing to change, deliberately.
 */
export interface PincodeRow {
  pincode: string;
  warehouseCode: string;
  etaMinutes: number;
  deliveryFeePaise: number;
  codAllowed: boolean;
  isActive: boolean;
}

export interface CsvIssue {
  /** 1-based line number in the file the person uploaded, header included. */
  line: number;
  message: string;
}

export type CsvParseResult =
  | { ok: true; rows: PincodeRow[] }
  | { ok: false; issues: CsvIssue[] };

const HEADER = [
  "pincode",
  "warehouse",
  "eta_minutes",
  "delivery_fee_rupees",
  "cod_allowed",
  "active",
] as const;

export const CSV_TEMPLATE = `${HEADER.join(",")}\n190001,SRINAGAR-CENTRAL,,49,no,yes\n`;

/** Yes/no in the spellings a spreadsheet actually produces. */
function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return null;
}

/** Rupees to integer paise, refusing anything that is not a plain amount. */
function parseFee(raw: string): number | null {
  const v = raw.trim().replace(/,/g, "");
  if (v === "") return 0;
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
}

export function parsePincodeCsv(text: string): CsvParseResult {
  const issues: CsvIssue[] = [];
  const lines = text.split(/\r?\n/).filter((l, i) => i === 0 || l.trim() !== "");

  if (lines.length === 0 || lines[0].trim() === "") {
    return { ok: false, issues: [{ line: 1, message: "The file is empty" }] };
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  if (header.length !== HEADER.length || HEADER.some((h, i) => header[i] !== h)) {
    return {
      ok: false,
      issues: [{ line: 1, message: `The header must be exactly: ${HEADER.join(",")}` }],
    };
  }

  const rows: PincodeRow[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const line = i + 1;
    const cells = lines[i].split(",").map((c) => c.trim());
    const bad = (message: string) => issues.push({ line, message });

    if (cells.length !== HEADER.length) {
      bad(`Expected ${HEADER.length} columns, found ${cells.length}`);
      continue;
    }

    const [pincode, warehouseCode, etaRaw, feeRaw, codRaw, activeRaw] = cells;

    if (!/^\d{6}$/.test(pincode)) {
      bad(`"${pincode}" is not a six-digit pincode`);
      continue;
    }
    if (!/^1[89]/.test(pincode)) {
      /* The market is Srinagar, J&K. A pincode outside it is a mistake, and a
         silent one — it would quietly promise delivery to a city with no
         warehouse behind it. */
      bad(`${pincode} is outside Jammu & Kashmir, which is the only market`);
      continue;
    }
    if (seen.has(pincode)) {
      bad(`${pincode} appears twice — also on line ${seen.get(pincode)}`);
      continue;
    }
    seen.set(pincode, line);

    if (warehouseCode === "") {
      bad(`${pincode} has no warehouse`);
      continue;
    }

    /* An empty ETA is allowed and means "no promise". A blank becoming 60 is
       exactly the unverified claim this project keeps having to remove, so it
       stays absent rather than being filled in. */
    let etaMinutes = 0;
    if (etaRaw !== "") {
      const n = Number(etaRaw);
      if (!Number.isInteger(n) || n <= 0 || n > 20_160) {
        bad(`${pincode} has an ETA of "${etaRaw}", which is not a whole number of minutes`);
        continue;
      }
      etaMinutes = n;
    }

    const fee = parseFee(feeRaw);
    if (fee === null) {
      bad(`${pincode} has a delivery fee of "${feeRaw}", which is not a rupee amount`);
      continue;
    }

    const cod = parseBool(codRaw);
    if (cod === null) {
      bad(`${pincode} has "${codRaw}" for cod_allowed — use yes or no`);
      continue;
    }

    const active = parseBool(activeRaw);
    if (active === null) {
      bad(`${pincode} has "${activeRaw}" for active — use yes or no`);
      continue;
    }

    rows.push({
      pincode,
      warehouseCode,
      etaMinutes,
      deliveryFeePaise: fee,
      codAllowed: cod,
      isActive: active,
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  if (rows.length === 0) {
    return { ok: false, issues: [{ line: 1, message: "The file has a header but no rows" }] };
  }
  return { ok: true, rows };
}
