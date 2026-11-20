import { handleConfirmPayment } from "@/lib/api/v1";
export async function POST(request: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  return handleConfirmPayment(request, (await params).orderNo);
}
