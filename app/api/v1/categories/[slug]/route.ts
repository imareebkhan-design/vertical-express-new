import { handleGetCategory } from "@/lib/api/v1";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handleGetCategory(request, (await params).slug);
}
