import "server-only";
import { z } from "zod";
import { parseGeocodeResponse } from "@/lib/geocode-parse";
import { captureException } from "@/lib/observability";

export const placesInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suggest"), query: z.string().trim().min(3).max(160), session: z.string().uuid() }),
  z.object({ action: z.literal("resolve"), placeId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/), session: z.string().uuid() }),
]);
/* Google's own AddressComponent can omit `types` entirely — real Srinagar
   addresses return an untyped free-text line (e.g. "Peerbagh naddirgund")
   alongside properly typed locality/postal_code components. Requiring `types`
   failed validation for the WHOLE address the moment one component lacked it,
   turning a resolvable address with a real pincode into "unavailable". */
const component = z.object({ longText: z.string(), shortText: z.string().optional(), types: z.array(z.string()).optional() });
const details = z.object({
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  addressComponents: z.array(component),
});
const suggestions = z.object({ suggestions: z.array(z.object({ placePrediction: z.object({ placeId: z.string(), text: z.object({ text: z.string() }) }).optional() })).optional() });

/** Server credential never leaves this boundary. No search text or coordinates logged. */
export async function lookupPlace(input: z.infer<typeof placesInput>, fetchImpl: typeof fetch = fetch) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { kind: "unavailable" as const };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const suggest = input.action === "suggest";
    const response = await fetchImpl(suggest ? "https://places.googleapis.com/v1/places:autocomplete" :
      `https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}?sessionToken=${encodeURIComponent(input.session)}`,
    { method: suggest ? "POST" : "GET", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": suggest ? "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text" : "location,addressComponents" },
      ...(suggest ? { body: JSON.stringify({ input: input.query, sessionToken: input.session, includedRegionCodes: ["in"], languageCode: "en" }) } : {}),
    });
    if (!response.ok) {
      captureException(new Error(`Places API HTTP ${response.status}`), { route: "places", action: input.action });
      return { kind: "unavailable" as const };
    }
    const body: unknown = await response.json();
    if (suggest) {
      const parsed = suggestions.safeParse(body);
      if (!parsed.success) {
        captureException(new Error(`Places suggest response failed validation: ${parsed.error.message}`), { route: "places", action: input.action });
        return { kind: "unavailable" as const };
      }
      return { kind: "suggestions" as const, suggestions: (parsed.data.suggestions ?? []).flatMap((s) => s.placePrediction ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text.text }] : []).slice(0, 5) };
    }
    const parsed = details.safeParse(body);
    if (!parsed.success) {
      captureException(new Error(`Places resolve response failed validation: ${parsed.error.message}`), { route: "places", action: input.action });
      return { kind: "unavailable" as const };
    }
    const geo = parseGeocodeResponse({ status: "OK", results: [{ address_components: parsed.data.addressComponents.map((c) => ({ long_name: c.longText, short_name: c.shortText ?? c.longText, types: c.types ?? [] })) }] });
    return { kind: "place" as const, coordinate: parsed.data.location, address: geo.kind === "found" ? geo.address : null };
  } catch (error) {
    captureException(error, { route: "places", action: input.action });
    return { kind: "unavailable" as const };
  } finally { clearTimeout(timeout); }
}
