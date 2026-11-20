import { handleServiceability } from "@/lib/api/v1";
export async function GET(request: Request, { params }: { params: Promise<{ pincode: string }> }) {
  return handleServiceability(request, (await params).pincode);
}
