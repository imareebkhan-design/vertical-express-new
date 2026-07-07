import "server-only";
import { db } from "@/lib/db";
import type { AddressInput } from "@/lib/validators";

export async function listAddresses(userId: string) {
  return db.address.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function createAddress(userId: string, input: AddressInput) {
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
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      isDefault: makeDefault,
    },
  });
}

export async function updateAddress(userId: string, id: string, input: AddressInput) {
  const existing = await db.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;

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
      city: input.city,
      state: input.state,
      pincode: input.pincode,
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
