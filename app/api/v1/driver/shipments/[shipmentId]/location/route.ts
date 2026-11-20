import { handleDriverLocation } from "@/lib/api/tracking";
export async function POST(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  return handleDriverLocation(request, (await params).shipmentId);
}
