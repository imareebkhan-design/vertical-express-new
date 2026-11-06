import { handlePlaceOrder, handleFindOrderByKey } from "@/lib/api/v1";
export const POST = (request: Request) => handlePlaceOrder(request);
export const GET = (request: Request) => handleFindOrderByKey(request);
