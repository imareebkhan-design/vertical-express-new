import { handleListAddresses, handleCreateAddress } from "@/lib/api/v1";
export const GET = (request: Request) => handleListAddresses(request);
export const POST = (request: Request) => handleCreateAddress(request);
