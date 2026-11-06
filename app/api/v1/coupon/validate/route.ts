import { handleValidateCoupon } from "@/lib/api/v1";
export const POST = (request: Request) => handleValidateCoupon(request);
