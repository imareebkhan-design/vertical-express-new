import "server-only";
import { withApiUser, readJson, type ApiDeps } from "@/lib/api/authed";
import { apiFail, apiOk } from "@/lib/api/response";
import { placesInput, lookupPlace } from "@/lib/services/places";
import { rateLimit } from "@/lib/services/rate-limit";

export function handlePlaces(request: Request, deps: ApiDeps = {}, lookup = lookupPlace) {
  return withApiUser(request, "places", deps, async ({ userId }) => {
    const parsed = placesInput.safeParse(await readJson(request));
    if (!parsed.success) return apiFail("VALIDATION", "Invalid address search");
    const minute = await rateLimit(`places-minute:${userId}`, 30, 60_000, { failClosed: true });
    const daily = await rateLimit(`places-day:${userId}`, 300, 86_400_000, { failClosed: true });
    if (!minute.allowed || !daily.allowed) return apiFail("RATE_LIMITED", "Too many address searches. Enter your pincode instead.");
    const result = await lookup(parsed.data);
    if (result.kind === "unavailable") return apiFail("UNAVAILABLE", "Address search is unavailable. Enter your pincode instead.");
    return apiOk(result);
  });
}
