import type { Prisma } from "@/prisma/generated/client/client";

/**
 * The one definition of "we deliver to this pincode": its own row is included
 * (active) AND the city it belongs to is live. Every reader — checkout, cart,
 * the address list, the storefront check — uses this, so switching a city off
 * stops all of it at once and nothing keeps selling to a city that is closed.
 */
export const SERVICEABLE_WHERE = {
  isActive: true,
  city: { isLive: true },
} satisfies Prisma.ServiceablePincodeWhereInput;
