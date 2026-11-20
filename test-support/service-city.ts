import { db } from "@/lib/db";

/**
 * The live city every test fixture's serviceable pincode belongs to. A pincode
 * is served only when its city is live (lib/serviceable-where.ts), so fixtures
 * that predate cities attach to this one. Shared and never deleted: pincode
 * rows reference it with ON DELETE RESTRICT.
 */
export async function liveTestCityId(): Promise<string> {
  const c = await db.serviceCity.upsert({
    where: { name: "ZZZ Test City" },
    create: { name: "ZZZ Test City", state: "Jammu & Kashmir", isLive: true },
    update: { isLive: true },
    select: { id: true },
  });
  return c.id;
}
