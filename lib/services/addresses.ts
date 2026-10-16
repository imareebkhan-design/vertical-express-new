import "server-only";
import { db } from "@/lib/db";
import type { AddressInput } from "@/lib/validators";
import { reverseGeocode } from "@/lib/services/geocoding";

type Geocode = typeof reverseGeocode;

/**
 * Google's pincode for a pin, or null when there is no pin or Google cannot
 * say. Recorded beside the customer's pincode, never in place of it: Google's
 * pincode boundaries are wrong often enough in Srinagar that refusing the save
 * would turn away real customers (owner decision, 16 Oct 2026). A difference
 * is a mismatch for ops to review.
 */
export async function pinPincodeFor(input: Pick<AddressInput, "latitude" | "longitude">, geocode: Geocode = reverseGeocode): Promise<string | null> {
  if (input.latitude == null || input.longitude == null) return null;
  const found = await geocode(input.latitude, input.longitude);
  return found.kind === "found" ? found.address.pincode : null;
}

export async function listAddresses(userId: string) {
  return db.address.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function createAddress(userId: string, input: AddressInput, geocode: Geocode = reverseGeocode) {
  const pinPincode = await pinPincodeFor(input, geocode);
  // First address (or explicitly chosen) becomes the default.
  const count = await db.address.count({ where: { userId, deletedAt: null } });
  const makeDefault = input.isDefault || count === 0;

  if (makeDefault) {
    await db.address.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  return db.address.create({
    data: {
      userId,
      label: input.label,
      name: input.name,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 || null,
      landmark: input.landmark || null,
      accessNote: input.accessNote || null,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      // A place id describes the pin; without one it is kept nowhere.
      placeId: input.latitude != null ? input.placeId ?? null : null,
      pinPincode,
      isDefault: makeDefault,
    },
  });
}

export async function updateAddress(userId: string, id: string, input: AddressInput, geocode: Geocode = reverseGeocode) {
  const existing = await db.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;

  const pinPincode = await pinPincodeFor(input, geocode);

  if (input.isDefault && !existing.isDefault) {
    await db.address.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  return db.address.update({
    where: { id },
    data: {
      label: input.label,
      name: input.name,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 || null,
      landmark: input.landmark || null,
      /* Omitted here until the app could edit a site, so editing any other
         field of an address silently kept a stale access note. */
      accessNote: input.accessNote || null,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      // A full text-only edit invalidates the former pin rather than retaining
      // coordinates for an address the customer may have moved.
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      placeId: input.latitude != null ? input.placeId ?? null : null,
      pinPincode,
      isDefault: input.isDefault || existing.isDefault,
    },
  });
}

export async function deleteAddress(userId: string, id: string) {
  const addr = await db.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!addr) return;
  await db.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  // Promote another address to default if we removed the default one.
  if (addr.isDefault) {
    const next = await db.address.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (next) await db.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}

export async function setDefaultAddress(userId: string, id: string) {
  const addr = await db.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!addr) return;
  await db.address.updateMany({ where: { userId }, data: { isDefault: false } });
  await db.address.update({ where: { id }, data: { isDefault: true } });
}
