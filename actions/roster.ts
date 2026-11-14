"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import {
  createDriver,
  createVehicle,
  setDriverActive,
  setVehicleActive,
  updateDriver,
  releaseDriverLogin,
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

/* The roster is edited on its own page and read by the dispatch board. */
function revalidateRoster() {
  revalidatePath("/admin/drivers");
  revalidatePath("/admin/dispatch");
}

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

  revalidateRoster();
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

  revalidateRoster();
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

  revalidateRoster();
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

  revalidateRoster();
  return succeed(null);
}

const updateDriverSchema = driverSchema.extend({ id: z.string().uuid() });

export async function adminUpdateDriver(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = updateDriverSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those details are not valid");
  }

  const res = await updateDriver({ driverId: parsed.data.id, name: parsed.data.name, phone: parsed.data.phone, actor: admin });
  if (!res.ok) {
    if (res.reason === "bound") {
      return fail("CONFLICT", "This driver has already signed in to the app with that number. Release their app login first if their phone changed.");
    }
    if (res.reason === "duplicate") return fail("CONFLICT", "Somebody on the roster already has that number");
    return fail("NOT_FOUND", "That driver no longer exists");
  }
  revalidateRoster();
  return succeed(null);
}

const releaseSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5, "Say why — for example \"phone lost, new handset\"").max(200),
});

export async function adminReleaseDriverLogin(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = releaseSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Say why");

  const res = await releaseDriverLogin({ driverId: parsed.data.id, reason: parsed.data.reason, actor: admin });
  if (!res.ok) {
    if (res.reason === "on_delivery") return fail("CONFLICT", "This driver is out on a delivery. Finish or reassign it first.");
    return fail("NOT_FOUND", "That driver no longer exists");
  }
  revalidateRoster();
  return succeed(null);
}
