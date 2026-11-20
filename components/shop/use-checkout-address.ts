"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { searchWithAddress, startingCheckoutAddress } from "@/lib/checkout-address";

/**
 * Which saved address this checkout delivers to — one rule for the desktop and
 * phone layouts.
 *
 * WHY THIS EXISTS
 *
 * Each layout kept the choice in its own component state and worked out a
 * starting point its own way. The desktop honoured `?address=`; the phone
 * layout ignored it, so coming back from "add an address" on a phone opened on
 * the default instead of the address just saved. Neither wrote a pick down, so
 * a reload, the back button, or the layout switching between phone and desktop
 * (a rotated tablet, a resized window — that remounts checkout) quietly put the
 * selection back on the default. A customer could choose a site, look away,
 * and pay for delivery somewhere else.
 *
 * So the choice lives in the URL: read from `?address=` on arrival, written back
 * on every pick with `history.replaceState` (no navigation, no refetch). A
 * requested address that is no longer theirs is reported as `requestedMissing`
 * rather than silently replaced by the default. If the selected address is
 * removed, nothing is selected — never a different address.
 */
export function useCheckoutAddressSelection(addresses: { id: string; isDefault: boolean }[]) {
  /* Null outside the App Router (component tests, previews): read the URL itself. */
  const params = useSearchParams();
  const requested =
    params?.get("address") ??
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("address") : null);

  const [start] = useState(() => startingCheckoutAddress(addresses, requested));
  const [chosen, setChosen] = useState(start.id);
  const [requestedMissing, setRequestedMissing] = useState(start.requestedMissing);

  const select = useCallback((id: string) => {
    setChosen(id);
    setRequestedMissing(false);
    remember(id || null);
  }, []);

  /* Gone from the list (deleted here or elsewhere): select nothing, so the
     customer has to choose, rather than inherit whichever address is next. */
  const addressId = chosen && addresses.some((a) => a.id === chosen) ? chosen : "";

  return { addressId, select, requestedMissing };
}

function remember(id: string | null) {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  const next = `${pathname}${searchWithAddress(search, id)}${hash}`;
  /* Keep the router's own history state; replacing it with null would lose
     Next.js's bookkeeping for this entry. */
  window.history.replaceState(window.history.state, "", next);
}
