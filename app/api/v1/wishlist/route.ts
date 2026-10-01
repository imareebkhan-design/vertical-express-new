import { handleGetWishlist } from "@/lib/api/v1";
export const GET = (request: Request) => handleGetWishlist(request);
