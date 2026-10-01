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

interface LocationState {
  pincode: string | null;
  city: string | null;
}

let locationState: LocationState = { pincode: null, city: null };
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
  locationState = { pincode: localStorage.getItem(KEY_PINCODE), city: localStorage.getItem(KEY_CITY) };
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
const SERVER_LOCATION: LocationState = { pincode: null, city: null };

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
    locationState = { pincode: candidate, city: "Srinagar" };
    return true;
  } catch {
    errorState = "Couldn't check that pincode. Try again.";
    return false;
  } finally {
    checkingState = false;
    emit();
  }
}

export function useDeliveryPincode() {
  const { pincode, city } = useSyncExternalStore(subscribe, getLocationSnapshot, getServerLocationSnapshot);
  const checking = useSyncExternalStore(subscribe, getCheckingSnapshot, getFalse);
  const error = useSyncExternalStore(subscribe, getErrorSnapshot, getNull);
  const confirm = useCallback((candidate: string) => confirmPincode(candidate), []);

  return { pincode, city, hasChosen: pincode !== null, checking, error, confirm };
}
