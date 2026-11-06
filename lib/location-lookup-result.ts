import type { LocationLookup } from "@/lib/services/location-lookup";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/** What the web's location sheet needs: a pincode to offer, and whether we
 *  deliver there. `locality` is the name a customer would recognise. */
export interface LocatedPincode {
  pincode: string;
  locality: string | null;
  serviceable: boolean;
}

/**
 * `lookUpLocation`'s answer as a server-action result. Every failure tells the
 * customer to type the pincode — the manual path needs no permission and no
 * Google, and it is always there. Same wording as `/api/v1/location/reverse`.
 */
export function locationLookupResult(found: LocationLookup): ActionResult<LocatedPincode> {
  switch (found.kind) {
    case "found":
      return succeed({
        pincode: found.address.pincode,
        locality: found.address.locality,
        serviceable: found.serviceability.serviceable,
      });
    case "rate_limited":
      return fail("RATE_LIMITED", "Too many location lookups. Enter your pincode instead.");
    case "invalid_coordinates":
      return fail("VALIDATION", "We couldn't read your location. Type your pincode instead.");
    case "no_pincode":
      return fail("NOT_FOUND", "We couldn't find a pincode for this spot. Enter it instead.");
    case "provider_error":
      return fail("UNAVAILABLE", "We couldn't look up your location. Enter your pincode instead.");
  }
}
