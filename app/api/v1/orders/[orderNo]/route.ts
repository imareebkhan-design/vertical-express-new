import { handleGetOrder } from "@/lib/api/v1";
export async function GET(request: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  return handleGetOrder(request, (await params).orderNo);
}
