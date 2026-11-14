import { handleDriverStart } from "@/lib/api/tracking";
export async function POST(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  return handleDriverStart(request, (await params).shipmentId);
}
