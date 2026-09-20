import { handleUpdateCartItem, handleRemoveCartItem } from "@/lib/api/v1";
type Ctx = { params: Promise<{ itemId: string }> };
export async function PATCH(request: Request, { params }: Ctx) {
  return handleUpdateCartItem(request, (await params).itemId);
}
export async function DELETE(request: Request, { params }: Ctx) {
  return handleRemoveCartItem(request, (await params).itemId);
}
