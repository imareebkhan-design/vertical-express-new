import { handleGetProduct } from "@/lib/api/v1";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handleGetProduct(request, (await params).slug);
}
