import { handleProductEnquiry } from "@/lib/api/product-enquiry";
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handleProductEnquiry(request, (await params).slug);
}
