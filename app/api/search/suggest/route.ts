import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/services/search";
import { rateLimit, getClientIp } from "@/lib/services/rate-limit";

/** GET /api/search/suggest?q=… — navbar typeahead. */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`search:${ip}`, 60, 60 * 1000); // 60 requests per min

  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many search requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const suggestions = await getSuggestions(q);
  return NextResponse.json(suggestions, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
