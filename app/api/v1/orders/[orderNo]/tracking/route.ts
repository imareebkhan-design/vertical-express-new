import { handleOrderTracking } from "@/lib/api/tracking";
export async function GET(request: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  return handleOrderTracking(request, (await params).orderNo);
}
