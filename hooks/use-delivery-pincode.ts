"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The desktop storefront's delivery pincode — real, shared, and persisted.
 *
 * Both `Navbar` and the homepage `Hero` previously kept their own
 * `useState("190014")` / `useState("Hyderpora")`, shown to every visitor as
 * if it were an established delivery site. Neither called any API: editing
 * one did nothing but hold a string in local component state, and the two
 * were not even connected to each other. That is exactly the fabricated
 * "current location" the location work exists to remove — Google/GPS is not
 * involved here, but the same rule applies: never present an unconfirmed
 * guess as a customer's actual delivery site.
 *
 * A PLAIN custom hook would not have fixed the second half of that bug: two
 * components each calling `useState` still hold two independent values, so
 * confirming a pincode in one would still leave the other showing the old
 * one until its next remount. This is a module-level external store instead
 * — one true value per page, read via `useSyncExternalStore` so every caller
 * re-renders the instant either one confirms a pincode — backed by the same
 * `ve_pincode` / `ve_city` keys the mobile web shell (`NativeShellProvider`)
 * already uses, so desktop and mobile web agree too.
 */

const KEY_PINCODE = "ve_pincode";
const KEY_CITY = "ve_city";
/** The confirmed place behind the pincode, when the customer chose one by GPS or search. */
const KEY_PLACE = "ve_delivery_place";

/** What a confirmed location keeps — see lib/location/delivery-candidate.ts. */
export interface DeliveryPlace {
  source: "gps" | "search";
  label: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string | null;
}

interface LocationState {
  pincode: string | null;
  city: string | null;
  place: DeliveryPlace | null;
}

let locationState: LocationState = { pincode: null, city: null, place: null };
let checkingState = false;
let errorState: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  locationState = { pincode: localStorage.getItem(KEY_PINCODE), city: localStorage.getItem(KEY_CITY), place: readPlace() };
}

function readPlace(): DeliveryPlace | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_PLACE) ?? "null") as DeliveryPlace | null;
    return raw && typeof raw.lat === "number" && typeof raw.lng === "number" && typeof raw.label === "string" ? raw : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getLocationSnapshot(): LocationState {
  hydrate();
  return locationState;
}

/* One object, not a fresh one per call: React compares server snapshots by
   identity, and a new object each time is reported as a possible infinite
   loop. It surfaced once the phone-web shell (mounted on every page) began
   reading this store. */
const SERVER_LOCATION: LocationState = { pincode: null, city: null, place: null };

function getServerLocationSnapshot(): LocationState {
  return SERVER_LOCATION;
}

const getCheckingSnapshot = () => checkingState;
const getErrorSnapshot = () => errorState;
const getFalse = () => false;
const getNull = () => null;

/** Real check against `ServiceablePincode`, via the same public endpoint the
 *  mobile web shell's pincode sheet already uses. Never sets anything unless
 *  the server confirms it. */
async function confirmPincode(candidate: string): Promise<boolean> {
  errorState = null;
  if (!/^\d{6}$/.test(candidate)) {
    errorState = "Enter a 6-digit pincode.";
    emit();
    return false;
  }
  checkingState = true;
  emit();
  try {
    const res = await fetch(`/api/serviceability/${candidate}`);
    if (!res.ok) throw new Error("request failed");
    const data: { serviceable: boolean } = await res.json();
    if (!data.serviceable) {
      errorState = "We don't deliver here yet.";
      return false;
    }
    /* The seed catalogue resolves every serviceable pincode to Srinagar — the
       same assumption the mobile web shell already makes, recorded there
       rather than repeated silently here. */
    localStorage.setItem(KEY_PINCODE, candidate);
    localStorage.setItem(KEY_CITY, "Srinagar");
    /* A typed pincode replaces any earlier pin: the customer chose it on purpose. */
    localStorage.removeItem(KEY_PLACE);
    locationState = { pincode: candidate, city: "Srinagar", place: null };
    return true;
  } catch {
    errorState = "Couldn't check that pincode. Try again.";
    return false;
  } finally {
    checkingState = false;
    emit();
  }
}

/**
 * Saves a place the customer confirmed in the location sheet. Only ever called
 * from an explicit "Deliver here" — a GPS fix never replaces a chosen location
 * on its own — and only for a place the server said we deliver to.
 */
function choosePlace(place: DeliveryPlace & { pincode: string; city: string | null; serviceable: boolean }): boolean {
  if (!place.serviceable || !/^\d{6}$/.test(place.pincode)) return false;
  const kept: DeliveryPlace = {
    source: place.source,
    label: place.label,
    formattedAddress: place.formattedAddress,
    lat: place.lat,
    lng: place.lng,
    placeId: place.placeId,
  };
  const city = place.city ?? "Srinagar";
  localStorage.setItem(KEY_PINCODE, place.pincode);
  localStorage.setItem(KEY_CITY, city);
  localStorage.setItem(KEY_PLACE, JSON.stringify(kept));
  locationState = { pincode: place.pincode, city, place: kept };
  errorState = null;
  emit();
  return true;
}

export function useDeliveryPincode() {
  const { pincode, city, place } = useSyncExternalStore(subscribe, getLocationSnapshot, getServerLocationSnapshot);
  const checking = useSyncExternalStore(subscribe, getCheckingSnapshot, getFalse);
  const error = useSyncExternalStore(subscribe, getErrorSnapshot, getNull);
  const confirm = useCallback((candidate: string) => confirmPincode(candidate), []);

  const choose = useCallback(choosePlace, []);

  return { pincode, city, place, hasChosen: pincode !== null, checking, error, confirm, choose };
}
