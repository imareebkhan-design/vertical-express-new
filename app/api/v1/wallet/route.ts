import { handleGetWallet } from "@/lib/api/v1";
export const GET = (request: Request) => handleGetWallet(request);
