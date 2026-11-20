/**
 * Turning a delivery address into something a driver can navigate to.
 *
 * WHY A PLAIN URL AND NOT A MAP
 *
 * The ops console prints a packing slip and runs a dispatch board; neither
 * needs an embedded map, and an embedded map would need a browser key. A
 * universal Google Maps URL opens whatever the driver already has, costs
 * nothing and needs no key at all.
 *
 * WHAT IT NAVIGATES TO
 *
 * The customer's own confirmed pin when there is one — that is the point of
 * asking for it, and in Srinagar a lane is often unfindable from the text
 * alone. Otherwise the written address, which is what the driver had before.
 * Nothing is invented: with neither a pin nor a line of address, there is no
 * link.
 */
export interface NavigableAddress {
  line1?: string | null;
  line2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function navigationUrlFor(address: NavigableAddress | null | undefined): string | null {
  if (!address) return null;

  const { latitude, longitude } = address;
  if (typeof latitude === "number" && typeof longitude === "number") {
    /* api=1 is Google's documented cross-platform form: it opens the native
       app where one is installed and the web map where none is. */
    return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }

  const written = [address.line1, address.line2, address.landmark, address.city, address.state, address.pincode]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (!written) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(written)}`;
}

/** True when the customer dropped a pin, which is worth saying on the slip. */
export function hasCustomerPin(address: NavigableAddress | null | undefined): boolean {
  return typeof address?.latitude === "number" && typeof address?.longitude === "number";
}
