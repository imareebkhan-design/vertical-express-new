/**
 * The browser's own Geolocation API — not a Google API: getting a device's
 * coordinates costs nothing and needs no key. Called only from a tap on "Use my
 * current location", never on page load.
 *
 * Every outcome the API can produce maps to its own message, and every message
 * leaves the customer a way forward (search or pincode) — a denied permission
 * never traps anyone.
 */

export type PositionOutcome =
  | { ok: true; lat: number; lng: number; accuracyM: number | null }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "unsupported" };

/** GeolocationPositionError codes, per the spec. */
export function reasonForCode(code: number): "denied" | "unavailable" | "timeout" {
  return code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable";
}

export function messageFor(reason: "denied" | "unavailable" | "timeout" | "unsupported"): string {
  switch (reason) {
    case "denied":
      return "Location access is off for this site. Search for your address below, or allow location in your browser settings and try again.";
    case "unavailable":
      return "Your device couldn't find where you are. Search for your address below instead.";
    case "timeout":
      return "Finding your location took too long. Try again, or search for your address below.";
    case "unsupported":
      return "This browser can't share your location. Search for your address below instead.";
  }
}

/** Accuracy worse than this is worth flagging before the customer confirms. */
export const APPROXIMATE_ABOVE_M = 150;

export function getBrowserPosition(
  geo: Geolocation | undefined = typeof navigator !== "undefined" ? navigator.geolocation : undefined
): Promise<PositionOutcome> {
  if (!geo) return Promise.resolve({ ok: false, reason: "unsupported" });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (p) =>
        resolve({
          ok: true,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
        }),
      (e) => resolve({ ok: false, reason: reasonForCode(e.code) }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  });
}
