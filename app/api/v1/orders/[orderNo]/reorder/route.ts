import { handleReorder } from "@/lib/api/v1";
export async function POST(request: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  return handleReorder(request, (await params).orderNo);
}
