import { handleDriverDeliver } from "@/lib/api/tracking";
export async function POST(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  return handleDriverDeliver(request, (await params).shipmentId);
}
