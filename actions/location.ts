"use server";

import { getAuthUserId } from "@/lib/auth/current-user";
import { lookUpLocation } from "@/lib/services/location-lookup";
import { locationLookupResult, type LocatedPincode } from "@/lib/location-lookup-result";
import { type ActionResult, fail, succeed } from "@/lib/validators";
import { headers } from "next/headers";
import { getClientIp, rateLimit } from "@/lib/services/rate-limit";
import { placesInput, lookupPlace } from "@/lib/services/places";
import { checkServiceability } from "@/lib/services/serviceability";
import type { ResolvedAddress } from "@/lib/geocode-parse";
import { formattedFor, labelFor, type DeliveryCandidate } from "@/lib/location/delivery-candidate";

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

/* ======================================================================
 * The location sheet ("Where should we deliver?") — signed in or not.
 *
 * Guests can use their location and search for an address, as in any
 * quick-commerce app; it is the first question the site asks. Each call is
 * billed by Google, so a guest is held to a tight per-address budget AND every
 * guest together to a fixed global one, both failing closed: the per-address
 * limit can be dodged by rotating `x-forwarded-for`, the global one cannot, so
 * the most a guest can ever cost us is bounded. Signed-in customers keep their
 * existing per-account limits.
 * ==================================================================== */

const GUEST_PER_IP = { minute: 8, day: 60 };
const GUEST_GLOBAL = { minute: 120, day: 3_000 };

async function lookupBudget(kind: "geo" | "places"): Promise<{ id: string } | { refused: true }> {
  const userId = await getAuthUserId();
  if (userId) return { id: userId };
  const ip = getClientIp(new Request("http://local", { headers: await headers() }));
  const checks = await Promise.all([
    rateLimit(`guest-${kind}-m:${ip}`, GUEST_PER_IP.minute, 60_000, { failClosed: true }),
    rateLimit(`guest-${kind}-d:${ip}`, GUEST_PER_IP.day, 86_400_000, { failClosed: true }),
    rateLimit(`guest-${kind}-m:all`, GUEST_GLOBAL.minute, 60_000, { failClosed: true }),
    rateLimit(`guest-${kind}-d:all`, GUEST_GLOBAL.day, 86_400_000, { failClosed: true }),
  ]);
  return checks.every((c) => c.allowed) ? { id: `guest:${ip}` } : { refused: true };
}

function candidate(address: ResolvedAddress, lat: number, lng: number, placeId: string | null, serviceable: boolean): DeliveryCandidate {
  return {
    label: labelFor(address),
    formattedAddress: formattedFor(address),
    pincode: address.pincode,
    locality: address.locality,
    city: address.city,
    state: address.state,
    lat,
    lng,
    placeId,
    serviceable,
  };
}

/** "Use my current location": browser coordinates → an address to confirm, and whether we deliver there. */
export async function locateForDelivery(lat: unknown, lng: unknown): Promise<ActionResult<DeliveryCandidate>> {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return fail("VALIDATION", "We couldn't read your location. Search for your address instead.");
  }
  const who = await lookupBudget("geo");
  if ("refused" in who) return fail("RATE_LIMITED", "Too many location lookups. Search for your address instead.");
  const found = await lookUpLocation(who.id, lat, lng);
  if (found.kind !== "found") {
    const r = locationLookupResult(found);
    return r.ok ? fail("UNAVAILABLE", "We couldn't look up your location.") : fail(r.error.code, r.error.message.replace("Enter your pincode", "Search for your address"));
  }
  return succeed(candidate(found.address, lat, lng, null, found.serviceability.serviceable));
}

export type PlaceSuggestion = { id: string; text: string };

/**
 * Manual search. `suggest` autocompletes (biased to Srinagar, not restricted —
 * delivery zones are the serviceability table's call, not the search box's);
 * `resolve` turns the chosen suggestion into an address to confirm.
 */
export async function searchDeliveryPlaces(
  input: unknown
): Promise<ActionResult<{ suggestions: PlaceSuggestion[] } | { candidate: DeliveryCandidate }>> {
  const parsed = placesInput.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Type at least 3 letters of your address");
  const who = await lookupBudget("places");
  if ("refused" in who) return fail("RATE_LIMITED", "Too many address searches. Enter your pincode instead.");
  const result = await lookupPlace(parsed.data);
  if (result.kind === "unavailable") return fail("UNAVAILABLE", "Address search is unavailable. Enter your pincode instead.");
  if (result.kind === "suggestions") return succeed({ suggestions: result.suggestions });
  if (!result.address) return fail("NOT_FOUND", "That place has no pincode. Try a nearby landmark or enter your pincode.");
  const service = await checkServiceability(result.address.pincode);
  const placeId = parsed.data.action === "resolve" ? parsed.data.placeId : null;
  return succeed({ candidate: candidate(result.address, result.coordinate.latitude, result.coordinate.longitude, placeId, service.serviceable) });
}
