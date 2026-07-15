import "server-only";

/**
 * GST — DEMO MODE (P1-2).
 *
 * This is a demonstration tax engine, not a certified GST implementation. It
 * applies a single flat slab to the whole order and a placeholder HSN code so
 * invoices/checkout visibly show a compliant-looking tax breakup. Before going
 * live you must replace this with per-item HSN-mapped rates and a real GSTIN.
 *
 * Model: seller is registered in Jammu & Kashmir (Srinagar). Intra-state supply
 * (buyer also in J&K) splits into CGST + SGST; inter-state supply uses IGST.
 */

/** Demo slab applied to every line. 18% is the common slab for hardware/fittings. */
export const DEMO_GST_RATE = 0.18;
/** Placeholder HSN — 7308 = structures & parts of iron/steel (construction). */
export const DEMO_HSN_CODE = "7308";
/** Seller's state of registration. */
const SELLER_STATE = "Jammu & Kashmir";

export interface GstBreakup {
  ratePct: number;      // total GST rate as a percentage, e.g. 18
  hsn: string;
  taxPaise: number;     // total GST
  cgstPaise: number;    // intra-state half (0 for inter-state)
  sgstPaise: number;    // intra-state half (0 for inter-state)
  igstPaise: number;    // inter-state (0 for intra-state)
  intraState: boolean;
}

function isJammuKashmir(state: string | null | undefined): boolean {
  if (!state) return true; // default to seller's own state
  const s = state.toLowerCase().replace(/[^a-z]/g, "");
  return s.includes("jammu") || s.includes("kashmir") || s === "jk";
}

/**
 * Compute GST on a taxable base (subtotal after discount, in paise).
 * `deliveryState` decides the intra/inter-state split.
 */
export function computeGst(taxableBasePaise: number, deliveryState?: string | null): GstBreakup {
  const taxPaise = Math.round(taxableBasePaise * DEMO_GST_RATE);
  const intraState = isJammuKashmir(deliveryState);

  if (intraState) {
    // Split evenly; give the odd paise to CGST so the halves always sum to taxPaise.
    const sgstPaise = Math.floor(taxPaise / 2);
    const cgstPaise = taxPaise - sgstPaise;
    return {
      ratePct: DEMO_GST_RATE * 100,
      hsn: DEMO_HSN_CODE,
      taxPaise,
      cgstPaise,
      sgstPaise,
      igstPaise: 0,
      intraState: true,
    };
  }

  return {
    ratePct: DEMO_GST_RATE * 100,
    hsn: DEMO_HSN_CODE,
    taxPaise,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: taxPaise,
    intraState: false,
  };
}

export { SELLER_STATE };
