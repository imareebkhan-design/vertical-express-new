import "server-only";
import type { DbClient } from "@/lib/services/audit";
import { recordAudit } from "@/lib/services/audit";
import { QA_FIXTURE_SKU } from "@/lib/catalog/qa-fixture-ids";

/**
 * Staging-only Delhi trial for the live-tracking QA order (15 Oct 2026).
 *
 * Delhi must not borrow Srinagar's stock or Srinagar's delivery promise, so the
 * trial has its own warehouse, holding stock of the QA TEST item ONLY (every
 * real product has zero stock there, so nothing real is sold to 110054). Its
 * delivery terms carry no business value: free, no ETA promise, no cash.
 * Every value comes from the caller; nothing is defaulted. The caller
 * (scripts/qa-delhi-trial.mts) proves the target is staging.
 *
 * Removal never deletes: the city goes off, 110054 is excluded, the QA stock
 * there is zeroed and the warehouse deactivated — any trial order keeps
 * pointing at real rows.
 */
export const TRIAL_CITY = "Delhi";
export const TRIAL_STATE = "Delhi";
export const TRIAL_PINCODE = "110054";
export const TRIAL_WAREHOUSE = "Delhi QA — staging trial";
export const TRIAL_AREA = "Staging QA trial — remove after test";

export interface DelhiTrialOptions {
  stock: number;
  deliveryFeePaise: number;
  /** 0 = no promise. */
  etaMinutes: number;
  live: boolean;
}

const AUDIT = { actorType: "system" as const, actorId: null };

export async function setupDelhiTrial(client: DbClient, o: DelhiTrialOptions) {
  for (const [k, v] of Object.entries({ stock: o.stock, deliveryFeePaise: o.deliveryFeePaise, etaMinutes: o.etaMinutes })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`--${k} must be given as a whole number ≥ 0`);
  }
  const variant = await client.productVariant.findUnique({ where: { sku: QA_FIXTURE_SKU }, select: { id: true } });
  if (!variant) throw new Error(`QA fixture ${QA_FIXTURE_SKU} not found — run the QA fixture first`);

  const wh =
    (await client.warehouse.findFirst({ where: { name: TRIAL_WAREHOUSE } })) ??
    (await client.warehouse.create({ data: { name: TRIAL_WAREHOUSE, city: TRIAL_CITY, pincode: TRIAL_PINCODE } }));
  if (!wh.isActive) await client.warehouse.update({ where: { id: wh.id }, data: { isActive: true } });

  const inv = await client.inventory.findFirst({ where: { variantId: variant.id, warehouseId: wh.id } });
  if (inv) await client.inventory.update({ where: { id: inv.id }, data: { qtyOnHand: o.stock } });
  else await client.inventory.create({ data: { variantId: variant.id, warehouseId: wh.id, qtyOnHand: o.stock } });

  const city =
    (await client.serviceCity.findUnique({ where: { name: TRIAL_CITY } })) ??
    (await client.serviceCity.create({ data: { name: TRIAL_CITY, state: TRIAL_STATE, isLive: false } }));
  if (city.state !== TRIAL_STATE) throw new Error(`City ${TRIAL_CITY} exists with state ${city.state}`);

  const existing = await client.serviceablePincode.findUnique({ where: { pincode: TRIAL_PINCODE } });
  if (existing && existing.cityId !== city.id) throw new Error(`${TRIAL_PINCODE} already belongs to another city`);
  const terms = {
    cityId: city.id, area: TRIAL_AREA, warehouseId: wh.id, etaMinutes: o.etaMinutes,
    deliveryFeePaise: o.deliveryFeePaise, codAllowed: false, isActive: true,
  };
  const pin = existing
    ? await client.serviceablePincode.update({ where: { pincode: TRIAL_PINCODE }, data: terms })
    : await client.serviceablePincode.create({ data: { pincode: TRIAL_PINCODE, ...terms } });
  if (city.isLive !== o.live) await client.serviceCity.update({ where: { id: city.id }, data: { isLive: o.live } });

  await recordAudit(client, {
    ...AUDIT, action: "service_city.qa_trial_setup", entityType: "ServiceCity", entityId: city.id,
    before: { city: TRIAL_CITY, isLive: city.isLive },
    after: { city: TRIAL_CITY, isLive: o.live, pincode: TRIAL_PINCODE, warehouse: TRIAL_WAREHOUSE, qaStock: o.stock, deliveryFeePaise: o.deliveryFeePaise, etaMinutes: o.etaMinutes, codAllowed: false },
  });
  return { warehouseId: wh.id, cityId: city.id, pincodeId: pin.id };
}

export async function removeDelhiTrial(client: DbClient): Promise<boolean> {
  const city = await client.serviceCity.findUnique({ where: { name: TRIAL_CITY } });
  if (!city) return false;
  await client.serviceCity.update({ where: { id: city.id }, data: { isLive: false } });
  await client.serviceablePincode.updateMany({ where: { pincode: TRIAL_PINCODE, cityId: city.id }, data: { isActive: false } });
  const wh = await client.warehouse.findFirst({ where: { name: TRIAL_WAREHOUSE } });
  if (wh) {
    await client.inventory.updateMany({ where: { warehouseId: wh.id }, data: { qtyOnHand: 0 } });
    await client.warehouse.update({ where: { id: wh.id }, data: { isActive: false } });
  }
  await recordAudit(client, {
    ...AUDIT, action: "service_city.qa_trial_removed", entityType: "ServiceCity", entityId: city.id,
    before: { city: TRIAL_CITY, isLive: city.isLive }, after: { city: TRIAL_CITY, isLive: false, pincode: TRIAL_PINCODE, excluded: true },
  });
  return true;
}
