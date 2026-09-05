"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import {
  createDriver,
  createVehicle,
  setDriverActive,
  setVehicleActive,
} from "@/lib/services/admin/roster-write";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Managing the delivery roster.
 *
 * The dispatch board could assign a driver from the moment the model landed,
 * and nothing could create one — on a fresh database the dropdown was empty and
 * every dispatch refused. This closes that.
 */

const driverSchema = z.object({
  name: z.string().trim().min(2, "A driver needs a name").max(80),
  /* Ten digits bare, or a full number with a country code. Normalised in the
     service the same way sign-in normalises one. */
  phone: z
    .string()
    .trim()
    .refine((v) => /^\+?\d{10,15}$/.test(v.replace(/[\s-]/g, "")), {
      message: "That is not a phone number",
    }),
});

const vehicleSchema = z.object({
  /* Indian plates run roughly AA00AA0000; kept loose because older and
     commercial series differ and refusing a real plate is worse than accepting
     an odd one. Uniqueness is what actually matters here. */
  registration: z.string().trim().min(4, "A vehicle needs its registration").max(20),
  kind: z.enum(["bike", "van", "truck"]),
});

const toggleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export async function adminCreateDriver(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = driverSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }

  const res = await createDriver({ ...parsed.data, actor: admin });
  if (!res.ok) {
    return fail("CONFLICT", "Somebody on the roster already has that number");
  }

  revalidatePath("/admin/dispatch");
  return succeed(null);
}

export async function adminSetDriverActive(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "That is not a driver");

  const res = await setDriverActive({
    driverId: parsed.data.id,
    isActive: parsed.data.isActive,
    actor: admin,
  });
  if (!res.ok) return fail("NOT_FOUND", "That driver no longer exists");

  revalidatePath("/admin/dispatch");
  return succeed(null);
}

export async function adminCreateVehicle(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }

  const res = await createVehicle({ ...parsed.data, actor: admin });
  if (!res.ok) return fail("CONFLICT", "That registration is already on the roster");

  revalidatePath("/admin/dispatch");
  return succeed(null);
}

export async function adminSetVehicleActive(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "That is not a vehicle");

  const res = await setVehicleActive({
    vehicleId: parsed.data.id,
    isActive: parsed.data.isActive,
    actor: admin,
  });
  if (!res.ok) return fail("NOT_FOUND", "That vehicle no longer exists");

  revalidatePath("/admin/dispatch");
  return succeed(null);
}
