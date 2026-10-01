import { handleToggleWishlist } from "@/lib/api/v1";
export const POST = (request: Request) => handleToggleWishlist(request);
