import { handleCancelOrder } from "@/lib/api/v1";
export async function POST(request: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  return handleCancelOrder(request, (await params).orderNo);
}
