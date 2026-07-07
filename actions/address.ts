"use server";

import { revalidatePath } from "next/cache";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/lib/services/addresses";
import { checkServiceability } from "@/lib/services/serviceability";
import { addressInputSchema, type ActionResult, fail, succeed } from "@/lib/validators";

async function requireUser(): Promise<string | null> {
  return getAuthUserId();
}

export async function saveAddress(
  input: unknown,
  id?: string
): Promise<ActionResult<{ id: string; serviceable: boolean }>> {
  const userId = await requireUser();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");

  const parsed = addressInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail("VALIDATION", issue?.message ?? "Invalid address", issue?.path[0]?.toString());
  }

  // Advisory serviceability check (does not block saving).
  const svc = await checkServiceability(parsed.data.pincode);

  const result = id
    ? await updateAddress(userId, id, parsed.data)
    : await createAddress(userId, parsed.data);

  if (!result) return fail("NOT_FOUND", "Address not found");

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return succeed({ id: result.id, serviceable: svc.serviceable });
}

export async function removeAddress(id: string): Promise<ActionResult<null>> {
  const userId = await requireUser();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");
  await deleteAddress(userId, id);
  revalidatePath("/account/addresses");
  return succeed(null);
}

export async function makeDefaultAddress(id: string): Promise<ActionResult<null>> {
  const userId = await requireUser();
  if (!userId) return fail("UNAUTHENTICATED", "Please log in");
  await setDefaultAddress(userId, id);
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return succeed(null);
}
