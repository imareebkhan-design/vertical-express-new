import "server-only";

/**
 * GST — PRODUCTION SPECIFICATION (Phase 15.2).
 *
 * Model: seller is registered in Jammu & Kashmir (Srinagar). Intra-state supply
 * (buyer also in J&K) splits into CGST + SGST; inter-state supply uses IGST.
 * Prices are GST-inclusive. Tax is extracted from the inclusive base.
 */

// Seller's state of registration.
const SELLER_STATE = "Jammu & Kashmir";

export interface CategoryTaxConfig {
  hsn: string;
  ratePct: number;
}

// Owner-confirmed category configurations (Owner Q2.2 & Q2.3)
export const CATEGORY_TAX_CONFIGS: Record<string, CategoryTaxConfig> = {
  cement: { hsn: "2523", ratePct: 28 }, // Cement (OPC/PPC) GST is 28%
  tiling: { hsn: "3214", ratePct: 18 }, // Grout/Cleaners/Adhesives GST is 18%
  painting: { hsn: "3208", ratePct: 18 }, // Paints/Varnishes GST is 18%
  waterproofing: { hsn: "3214", ratePct: 18 },
  fevicol: { hsn: "3506", ratePct: 18 }, // Glues/Adhesives GST is 18%
  "wires-mcb-distribution-boards": { hsn: "8544", ratePct: 18 }, // Wires/Cables GST is 18%
  "switches-sockets": { hsn: "8536", ratePct: 18 }, // Switches/Sockets GST is 18%
  "conduits-gi-boxes": { hsn: "8538", ratePct: 18 }, // Electrical boxes/parts GST is 18%
  lighting: { hsn: "9405", ratePct: 18 }, // LED Lights GST is 18%
  "ceiling-fans-exhaust": { hsn: "8414", ratePct: 18 }, // Fans GST is 18%
  "home-appliances-power-backup": { hsn: "8504", ratePct: 18 }, // Inverters GST is 18%
  "cpvc-pipes-overhead-tanks": { hsn: "3917", ratePct: 18 }, // CPVC Pipes/Tanks GST is 18%
  "sanitary-bath-fittings": { hsn: "6910", ratePct: 18 }, // Sanitaryware GST is 18%
  "kitchen-sinks-faucets": { hsn: "7324", ratePct: 18 }, // Sinks/Faucets GST is 18%
  "hinges-channels-handles": { hsn: "8302", ratePct: 18 }, // Hardware fittings GST is 18%
  "kitchen-systems-accessories": { hsn: "7323", ratePct: 18 },
  "wardrobe-bed-fittings": { hsn: "8302", ratePct: 18 },
  "door-locks-hardware": { hsn: "8301", ratePct: 18 }, // Door locks GST is 18%
  "general-hardware-tools": { hsn: "8205", ratePct: 18 }, // Hand tools GST is 18%
};

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
 * Compute GST on an inclusive base (paise).
 * `deliveryState` decides the intra/inter-state split.
 * `categorySlug` selects the owner-confirmed rate/HSN, falling back to 18%/7308.
 */
export function computeGst(
  inclusiveBasePaise: number,
  deliveryState?: string | null,
  categorySlug?: string | null
): GstBreakup {
  const config = categorySlug ? CATEGORY_TAX_CONFIGS[categorySlug] : null;
  const ratePct = config?.ratePct ?? 18;
  const hsn = config?.hsn ?? "7308";

  // GST extraction: taxableBase = Math.round((inclusive * 100) / (100 + ratePct))
  const taxableBasePaise = Math.round((inclusiveBasePaise * 100) / (100 + ratePct));
  const taxPaise = inclusiveBasePaise - taxableBasePaise;

  const intraState = isJammuKashmir(deliveryState);

  if (intraState) {
    // Split evenly; give the odd paise to CGST so the halves always sum to taxPaise.
    const sgstPaise = Math.floor(taxPaise / 2);
    const cgstPaise = taxPaise - sgstPaise;
    return {
      ratePct,
      hsn,
      taxPaise,
      cgstPaise,
      sgstPaise,
      igstPaise: 0,
      intraState: true,
    };
  }

  return {
    ratePct,
    hsn,
    taxPaise,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: taxPaise,
    intraState: false,
  };
}

export { SELLER_STATE };
