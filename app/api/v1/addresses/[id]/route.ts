import { handleUpdateAddress, handleDeleteAddress } from "@/lib/api/v1";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateAddress(request, (await params).id);
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDeleteAddress(request, (await params).id);
}
