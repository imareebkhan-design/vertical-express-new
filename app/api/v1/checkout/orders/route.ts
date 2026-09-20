import { handlePlaceOrder } from "@/lib/api/v1";
export const POST = (request: Request) => handlePlaceOrder(request);
