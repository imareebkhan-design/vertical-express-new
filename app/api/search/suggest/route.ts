import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/services/search";

/** GET /api/search/suggest?q=… — navbar typeahead. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const suggestions = await getSuggestions(q);
  return NextResponse.json(suggestions, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
