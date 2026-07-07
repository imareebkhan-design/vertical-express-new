import "server-only";
import { db } from "@/lib/db";

export interface ServiceabilityResult {
  serviceable: boolean;
  etaMinutes: number | null;
  deliveryFeePaise: number | null;
  codAllowed: boolean;
}

/** Look up delivery serviceability for a pincode. Cached via route/tag layer. */
export async function checkServiceability(pincode: string): Promise<ServiceabilityResult> {
  const row = await db.serviceablePincode.findFirst({
    where: { pincode, isActive: true },
  });
  if (!row) {
    return { serviceable: false, etaMinutes: null, deliveryFeePaise: null, codAllowed: false };
  }
  return {
    serviceable: true,
    etaMinutes: row.etaMinutes,
    deliveryFeePaise: row.deliveryFeePaise,
    codAllowed: row.codAllowed,
  };
}
