import "server-only";
import { db } from "@/lib/db";

export async function listServiceCategories() {
  return db.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getServiceBySlug(slug: string) {
  return db.service.findFirst({ where: { slug, isActive: true }, include: { category: true } });
}

export interface CreateBookingInput {
  serviceSlug: string;
  name: string;
  phone: string;
  propertyType: "apartment" | "house" | "plot" | "commercial";
  scope: string;
  preferredDate?: string | null;
  city?: string;
  pincode?: string;
  userId?: string | null;
}

function bookingNumber(seq: number): string {
  return `VE-BK-${String(seq).padStart(6, "0")}`;
}

export async function createBooking(input: CreateBookingInput) {
  const service = await db.service.findFirst({ where: { slug: input.serviceSlug, isActive: true } });
  if (!service) throw new Error("SERVICE_NOT_FOUND");

  const seq = (await db.booking.count()) + 1;
  return db.booking.create({
    data: {
      bookingNo: bookingNumber(seq),
      userId: input.userId ?? null,
      serviceId: service.id,
      name: input.name,
      phone: input.phone,
      propertyType: input.propertyType,
      scope: input.scope,
      preferredDate: input.preferredDate ? new Date(input.preferredDate) : null,
      address: input.city || input.pincode ? { city: input.city, pincode: input.pincode } : undefined,
      status: "received",
    },
  });
}

export async function listMyBookings(userId: string) {
  return db.booking.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { service: { include: { category: true } } },
  });
}
