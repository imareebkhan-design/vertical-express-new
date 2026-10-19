/**
 * Which saved address the web checkout opens on.
 *
 * Arriving back from "Add a delivery address" (`/checkout?address=<id>`), the
 * address just saved is the one the customer meant — not the old default they
 * left behind. An id that is not theirs, or no longer exists, is ignored.
 * Otherwise the default, else the first.
 */
export function initialCheckoutAddress(addresses: { id: string; isDefault: boolean }[], requested: string | null): string {
  return startingCheckoutAddress(addresses, requested).id;
}

/**
 * Where checkout starts, and whether that is the address that was asked for.
 *
 * `?address=` is how checkout remembers the customer's choice — written on every
 * pick, so a reload, the back button, or the phone/desktop layout swapping does
 * not quietly change where the goods go. When the id it names is no longer one
 * of theirs (deleted, another account), checkout still opens somewhere sensible
 * but `requestedMissing` is true, so the screen says so instead of passing off
 * the default as the address they chose.
 */
export function startingCheckoutAddress(
  addresses: { id: string; isDefault: boolean }[],
  requested: string | null
): { id: string; requestedMissing: boolean } {
  if (requested && addresses.some((a) => a.id === requested)) return { id: requested, requestedMissing: false };
  return {
    id: addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "",
    requestedMissing: Boolean(requested),
  };
}

/** `search` (a `location.search`) with `address` set to `id`, every other parameter kept. */
export function searchWithAddress(search: string, id: string | null): string {
  const p = new URLSearchParams(search);
  if (id) p.set("address", id);
  else p.delete("address");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Where to go after saving an address that was added from `returnTo`, carrying the new id. */
export function returnWithAddress(returnTo: string, id: string): string {
  return `${returnTo}${returnTo.includes("?") ? "&" : "?"}address=${encodeURIComponent(id)}`;
}
