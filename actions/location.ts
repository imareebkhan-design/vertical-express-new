"use server";

import { getAuthUserId } from "@/lib/auth/current-user";
import { lookUpLocation } from "@/lib/services/location-lookup";
import { locationLookupResult, type LocatedPincode } from "@/lib/location-lookup-result";
import { type ActionResult, fail } from "@/lib/validators";

/**
 * "Use my location" on the web: device coordinates → the pincode Google puts
 * them in, and whether we deliver there.
 *
 * The same lookup as `/api/v1/location/reverse` (the native app's route),
 * reached through the session cookie instead of a bearer token. Signed in
 * only, as that route is — each call is billed. The answer is a suggestion
 * the customer confirms; nothing here saves a location.
 */
/** Asked before the browser's permission prompt, so an anonymous visitor is
 *  never asked for their location only to be told the lookup needs sign-in. */
export async function canUseMyLocation(): Promise<boolean> {
  return (await getAuthUserId()) !== null;
}

export async function lookUpMyPincode(lat: unknown, lng: unknown): Promise<ActionResult<LocatedPincode>> {
  const userId = await getAuthUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Sign in to use your location, or type your pincode.");

  if (typeof lat !== "number" || typeof lng !== "number") {
    return fail("VALIDATION", "We couldn't read your location. Type your pincode instead.");
  }

  return locationLookupResult(await lookUpLocation(userId, lat, lng));
}
