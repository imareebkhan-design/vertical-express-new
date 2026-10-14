import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/prisma/generated/client/client";
import { SERVICEABLE_WHERE } from "@/lib/serviceable-where";

export interface ServiceabilityResult {
  serviceable: boolean;
  etaMinutes: number | null;
  deliveryFeePaise: number | null;
  codAllowed: boolean;
  /** The served city's state — the GST place of supply. Null when not served. */
  state: string | null;
}

/** Look up delivery serviceability for a pincode: included, and its city live. */
export async function checkServiceability(pincode: string): Promise<ServiceabilityResult> {
  const row = await db.serviceablePincode.findFirst({
    where: { pincode, ...SERVICEABLE_WHERE },
    select: { etaMinutes: true, deliveryFeePaise: true, codAllowed: true, city: { select: { state: true } } },
  });
  if (!row) {
    return { serviceable: false, etaMinutes: null, deliveryFeePaise: null, codAllowed: false, state: null };
  }
  return {
    serviceable: true,
    etaMinutes: row.etaMinutes,
    deliveryFeePaise: row.deliveryFeePaise,
    codAllowed: row.codAllowed,
    state: row.city.state,
  };
}

/**
 * Inside the order transaction: re-check the decision under a share lock on
 * the pincode row and its city row. A city switch-off or pincode exclusion
 * (an UPDATE on those rows) waits for an in-flight placement to commit, and a
 * placement that starts after it sees the switch-off and refuses — so no order
 * is created for a city that was closed while checkout was running. The
 * warehouse must still be the one the quote reserved stock against.
 */
export async function lockServiceability(
  tx: Prisma.TransactionClient,
  pincode: string,
  expectedWarehouseId: string
): Promise<void> {
  const rows = await tx.$queryRaw<{ warehouse_id: string }[]>`
    SELECT sp.warehouse_id::text AS warehouse_id
    FROM serviceable_pincodes sp
    JOIN service_cities c ON c.id = sp.city_id
    WHERE sp.pincode = ${pincode} AND sp.is_active AND c.is_live
    FOR SHARE OF sp, c`;
  if (!rows[0] || rows[0].warehouse_id !== expectedWarehouseId) throw new Error("PINCODE_UNSERVICEABLE");
}
