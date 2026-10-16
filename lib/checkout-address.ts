/**
 * Which saved address the web checkout opens on.
 *
 * Arriving back from "Add a delivery address" (`/checkout?address=<id>`), the
 * address just saved is the one the customer meant — not the old default they
 * left behind. An id that is not theirs, or no longer exists, is ignored.
 * Otherwise the default, else the first.
 */
export function initialCheckoutAddress(addresses: { id: string; isDefault: boolean }[], requested: string | null): string {
  if (requested && addresses.some((a) => a.id === requested)) return requested;
  return addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";
}

/** Where to go after saving an address that was added from `returnTo`, carrying the new id. */
export function returnWithAddress(returnTo: string, id: string): string {
  return `${returnTo}${returnTo.includes("?") ? "&" : "?"}address=${encodeURIComponent(id)}`;
}
