import { NextResponse } from "next/server";
import { checkServiceability } from "@/lib/services/serviceability";
import { pincodeSchema } from "@/lib/validators";

/** GET /api/serviceability/:pincode — client-side pincode checks (PDP, checkout). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pincode: string }> }
) {
  const { pincode } = await params;
  const parsed = pincodeSchema.safeParse(pincode);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pincode" }, { status: 400 });
  }

  const result = await checkServiceability(parsed.data);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
